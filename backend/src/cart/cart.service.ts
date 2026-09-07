import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LIVE_PRODUCT } from '../catalog/catalog.service';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

/** Mirrors web `core/models.ts` `CartItem`. */
export interface CartItemView {
  id: string;
  cartId: string;
  productId: string;
  productName: string;
  imageUrl: string;
  unitPriceCents: number;
  stockQty: number;
  qty: number;
  lineTotalCents: number;
}

export interface CartView {
  id: string;
  items: CartItemView[];
  totalCents: number;
  count: number;
}

type CartItemWithProduct = Prisma.CartItemGetPayload<{ include: { product: true } }>;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The cart is keyed on userId, so persistence across sign-out/sign-in is
   * inherent — there is nothing to merge at login.
   */
  async getOrCreateCart(userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.cart.findUnique({ where: { userId }, select: { id: true } });
    if (existing) {
      return existing;
    }
    return this.prisma.cart.create({ data: { userId }, select: { id: true } });
  }

  async view(userId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
    });
    const lines = items.map((item) => CartService.toLine(item));
    return {
      id: cart.id,
      items: lines,
      totalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
      count: lines.reduce((sum, line) => sum + line.qty, 0),
    };
  }

  /** Upserts by (cartId, productId), summing quantity. */
  async addItem(userId: string, dto: AddItemDto): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, ...LIVE_PRODUCT },
    });
    if (!product) {
      throw new NotFoundException('That product is no longer available.');
    }

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId: product.id } },
    });
    const nextQty = (existing?.qty ?? 0) + dto.qty;
    // Rejected before any write, so the existing quantity is left unchanged.
    this.assertStock(product.name, product.stockQty, nextQty);

    if (existing) {
      await this.prisma.cartItem.update({ where: { id: existing.id }, data: { qty: nextQty } });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, productId: product.id, qty: nextQty },
      });
    }
    return this.view(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateItemDto): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: { product: true },
    });
    if (!item) {
      throw new NotFoundException('That cart line no longer exists.');
    }

    this.assertStock(item.product.name, item.product.stockQty, dto.qty);
    await this.prisma.cartItem.update({ where: { id: item.id }, data: { qty: dto.qty } });
    return this.view(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) {
      throw new NotFoundException('That cart line no longer exists.');
    }
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.view(userId);
  }

  /** 400s name the product so the SPA can render the message verbatim. */
  private assertStock(productName: string, stockQty: number, qty: number): void {
    if (qty < 1) {
      throw new BadRequestException(`Quantity for ${productName} must be at least 1.`);
    }
    if (stockQty === 0) {
      throw new BadRequestException(`${productName} is out of stock.`);
    }
    if (qty > stockQty) {
      throw new BadRequestException(`Only ${stockQty} of ${productName} left in stock.`);
    }
  }

  private static toLine(item: CartItemWithProduct): CartItemView {
    return {
      id: item.id,
      cartId: item.cartId,
      productId: item.productId,
      productName: item.product.name,
      imageUrl: item.product.imageUrl,
      unitPriceCents: item.product.priceCents,
      stockQty: item.product.stockQty,
      qty: item.qty,
      lineTotalCents: item.product.priceCents * item.qty,
    };
  }
}
