import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService, LIVE_PRODUCT, type ProductView } from '../catalog/catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';

/** placed -> shipped -> delivered. Forward-only, one step at a time. */
export const STATUS_ORDER: OrderStatus[] = [
  OrderStatus.placed,
  OrderStatus.shipped,
  OrderStatus.delivered,
];

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const index = STATUS_ORDER.indexOf(status);
  return index >= 0 && index < STATUS_ORDER.length - 1 ? STATUS_ORDER[index + 1] : null;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(q?: string): Promise<ProductView[]> {
    const where: Prisma.ProductWhereInput = { ...LIVE_PRODUCT };
    const needle = q?.trim();
    if (needle) {
      where.name = { contains: needle, mode: 'insensitive' };
    }
    const products = await this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    return products.map(CatalogService.toProductView);
  }

  /**
   * The catalog ships empty, so an admin needs a way to create the first
   * category before any product can exist.
   */
  async createCategory(dto: CreateCategoryDto): Promise<{ id: string; name: string }> {
    const name = dto.name.trim();
    const existing = await this.prisma.category.findUnique({ where: { name } });
    if (existing) {
      return { id: existing.id, name: existing.name };
    }
    const category = await this.prisma.category.create({ data: { name } });
    return { id: category.id, name: category.name };
  }

  async createProduct(dto: CreateProductDto): Promise<ProductView> {
    const categoryId = await this.resolveCategoryId(dto.categoryId, dto.categoryName);
    const product = await this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        categoryId,
        description: dto.description.trim(),
        priceCents: dto.priceCents,
        imageUrl: dto.imageUrl.trim(),
        stockQty: dto.stockQty,
      },
      include: { category: true },
    });
    return CatalogService.toProductView(product);
  }

  async updateProduct(id: string, dto: UpdateProductDto): Promise<ProductView> {
    const existing = await this.prisma.product.findFirst({ where: { id, ...LIVE_PRODUCT } });
    if (!existing) {
      throw new NotFoundException('That product could not be found.');
    }
    const categoryId =
      dto.categoryId || dto.categoryName
        ? await this.resolveCategoryId(dto.categoryId, dto.categoryName)
        : undefined;

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl.trim() } : {}),
        ...(dto.stockQty !== undefined ? { stockQty: dto.stockQty } : {}),
      },
      include: { category: true },
    });
    return CatalogService.toProductView(product);
  }

  /**
   * Soft delete. The row stays so historical OrderItems and Reviews keep their
   * relations; every catalog read filters on `deletedAt: null`.
   */
  async deleteProduct(id: string): Promise<{ id: string; deletedAt: string }> {
    const existing = await this.prisma.product.findFirst({ where: { id, ...LIVE_PRODUCT } });
    if (!existing) {
      throw new NotFoundException('That product could not be found.');
    }
    const deleted = await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    // The line is dropped from live carts; placed orders are untouched.
    await this.prisma.cartItem.deleteMany({ where: { productId: id } });
    return { id: deleted.id, deletedAt: (deleted.deletedAt as Date).toISOString() };
  }

  /** Rejects anything backwards or skipping, naming the attempted transition. */
  async advanceOrderStatus(orderId: string, target: OrderStatus): Promise<OrderStatus> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('That order could not be found.');
    }
    if (nextStatus(order.status) !== target) {
      throw new BadRequestException(
        `Cannot move order ${orderId} from ${order.status} to ${target}.`,
      );
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: target },
    });
    return updated.status;
  }

  /** Accepts an existing id, or a name that is created on first use. */
  private async resolveCategoryId(categoryId?: string, categoryName?: string): Promise<string> {
    if (categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        throw new BadRequestException('Choose an existing category.');
      }
      return category.id;
    }
    const name = categoryName?.trim();
    if (!name) {
      throw new BadRequestException('Choose a category.');
    }
    const created = await this.createCategory({ name });
    return created.id;
  }
}
