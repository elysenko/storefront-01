import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PAGE_SIZE, QueryProductsDto } from './dto/query-products.dto';

/** Row shape the SPA consumes; mirrors web `core/models.ts` `Product`. */
export interface ProductView {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  stockQty: number;
  categoryId: string;
  categoryName: string;
  avgRating: number;
  reviewCount: number;
  inStock: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export interface ReviewView {
  id: string;
  productId: string;
  userId: string;
  userEmail: string;
  rating: number;
  body: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

type ProductWithCategory = Prisma.ProductGetPayload<{ include: { category: true } }>;
type ReviewWithUser = Prisma.ReviewGetPayload<{ include: { user: { select: { email: true } } } }>;

/** Soft-deleted products never surface in browse, search or detail. */
export const LIVE_PRODUCT: Prisma.ProductWhereInput = { deletedAt: null };

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  static toProductView(product: ProductWithCategory): ProductView {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      imageUrl: product.imageUrl,
      stockQty: product.stockQty,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? '',
      avgRating: product.avgRating,
      reviewCount: product.reviewCount,
      inStock: product.stockQty > 0,
      deletedAt: product.deletedAt ? product.deletedAt.toISOString() : null,
      createdAt: product.createdAt.toISOString(),
    };
  }

  static toReviewView(review: ReviewWithUser): ReviewView {
    return {
      id: review.id,
      productId: review.productId,
      userId: review.userId,
      userEmail: review.user?.email ?? '',
      rating: review.rating,
      body: review.body,
      createdAt: review.createdAt.toISOString(),
    };
  }

  async listCategories(): Promise<{ id: string; name: string }[]> {
    const categories = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return categories.map((category) => ({ id: category.id, name: category.name }));
  }

  /** Search and category filter compose; 12 rows per page by default. */
  async listProducts(query: QueryProductsDto): Promise<Paginated<ProductView>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : DEFAULT_PAGE_SIZE;
    const q = query.q?.trim();

    const where: Prisma.ProductWhereInput = { ...LIVE_PRODUCT };
    if (q) {
      where.name = { contains: q, mode: 'insensitive' };
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map(CatalogService.toProductView), total, page, pageSize };
  }

  async getProduct(id: string): Promise<ProductView & { reviews: ReviewView[] }> {
    const product = await this.prisma.product.findFirst({
      where: { id, ...LIVE_PRODUCT },
      include: { category: true },
    });
    if (!product) {
      throw new NotFoundException('That product is no longer available.');
    }
    const reviews = await this.listReviews(id);
    return { ...CatalogService.toProductView(product), reviews };
  }

  async listReviews(productId: string): Promise<ReviewView[]> {
    const reviews = await this.prisma.review.findMany({
      where: { productId },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reviews.map(CatalogService.toReviewView);
  }
}
