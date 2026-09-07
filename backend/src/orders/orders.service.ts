import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

/** Mirrors web `core/models.ts` `OrderItem`. */
export interface OrderItemView {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  imageUrl: string;
  unitPriceCents: number;
  qty: number;
}

export interface OrderView {
  id: string;
  userId: string;
  userEmail: string;
  status: OrderStatus;
  totalCents: number;
  shipName: string;
  shipAddress: string;
  createdAt: string;
  items: OrderItemView[];
}

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { items: true; user: { select: { email: true } } };
}>;

const ORDER_INCLUDE = { items: true, user: { select: { email: true } } } as const;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  static toOrderView(order: OrderWithRelations): OrderView {
    return {
      id: order.id,
      userId: order.userId,
      userEmail: order.user?.email ?? '',
      status: order.status,
      totalCents: order.totalCents,
      shipName: order.shipName,
      shipAddress: order.shipAddress,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        productName: item.productName,
        imageUrl: item.imageUrl,
        unitPriceCents: item.unitPriceCents,
        qty: item.qty,
      })),
    };
  }

  /**
   * Checkout. Stock re-validation, order creation, stock decrement and cart
   * emptying all share one transaction, so concurrent checkouts cannot oversell:
   * the decrement is a conditional updateMany that fails the whole transaction
   * when another checkout got there first.
   */
  async checkout(userId: string, dto: CreateOrderDto): Promise<OrderView> {
    const order = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: { items: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
      });
      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Your cart is empty.');
      }

      for (const line of cart.items) {
        const product = line.product;
        if (product.deletedAt) {
          throw new BadRequestException(`${product.name} is no longer available.`);
        }
        if (line.qty > product.stockQty) {
          throw new BadRequestException(
            `${product.name} only has ${product.stockQty} left in stock — reduce the quantity to continue.`,
          );
        }
      }

      const totalCents = cart.items.reduce(
        (sum, line) => sum + line.product.priceCents * line.qty,
        0,
      );

      const created = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.placed,
          totalCents,
          shipName: dto.shipName.trim(),
          shipAddress: dto.shipAddress.trim(),
          items: {
            create: cart.items.map((line) => ({
              // productName / unitPriceCents / imageUrl are frozen here: a later
              // price change or soft delete never rewrites order history.
              productId: line.productId,
              productName: line.product.name,
              imageUrl: line.product.imageUrl,
              unitPriceCents: line.product.priceCents,
              qty: line.qty,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });

      for (const line of cart.items) {
        const decremented = await tx.product.updateMany({
          where: { id: line.productId, stockQty: { gte: line.qty } },
          data: { stockQty: { decrement: line.qty } },
        });
        if (decremented.count === 0) {
          throw new BadRequestException(
            `${line.product.name} sold out while you were checking out — reduce the quantity to continue.`,
          );
        }
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return created;
    });

    return OrdersService.toOrderView(order);
  }

  /** Own orders only, newest first. */
  async listForUser(userId: string, status?: OrderStatus): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId, ...(status ? { status } : {}) },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(OrdersService.toOrderView);
  }

  /** Every order, newest first, joined to the shopper's email. Admin only. */
  async listAll(status?: OrderStatus): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      where: status ? { status } : {},
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(OrdersService.toOrderView);
  }

  /**
   * An order belonging to someone else reads as missing (404, not 403) so the
   * endpoint never confirms that another shopper's order id exists.
   */
  async getOne(orderId: string, userId: string, isAdmin: boolean): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...(isAdmin ? {} : { userId }) },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('That order could not be found.');
    }
    return OrdersService.toOrderView(order);
  }
}
