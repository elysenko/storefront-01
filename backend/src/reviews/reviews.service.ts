import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService, LIVE_PRODUCT, type ReviewView } from '../catalog/catalog.service';
import { CreateReviewDto } from './dto/create-review.dto';

export interface ReviewEligibility {
  eligible: boolean;
  /** Why the review form is hidden — rendered inline by the SPA. */
  reason: 'ok' | 'signed-out' | 'not-purchased' | 'already-reviewed';
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  list(productId: string): Promise<ReviewView[]> {
    return this.catalog.listReviews(productId);
  }

  async eligibility(productId: string, userId?: string): Promise<ReviewEligibility> {
    if (!userId) {
      return { eligible: false, reason: 'signed-out' };
    }
    if (!(await this.hasDeliveredPurchase(productId, userId))) {
      return { eligible: false, reason: 'not-purchased' };
    }
    const existing = await this.prisma.review.findUnique({
      where: { productId_userId: { productId, userId } },
    });
    return existing
      ? { eligible: false, reason: 'already-reviewed' }
      : { eligible: true, reason: 'ok' };
  }

  /**
   * Inserts the review and recomputes the denormalized `avgRating` /
   * `reviewCount` from the aggregate inside the same transaction, so the two
   * can never drift apart.
   */
  async create(productId: string, userId: string, dto: CreateReviewDto): Promise<ReviewView> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, ...LIVE_PRODUCT } });
    if (!product) {
      throw new NotFoundException('That product is no longer available.');
    }
    if (!(await this.hasDeliveredPurchase(productId, userId))) {
      throw new ForbiddenException(
        'You can only review products from an order that has been delivered.',
      );
    }

    try {
      const review = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.review.create({
          data: { productId, userId, rating: dto.rating, body: dto.body.trim() },
          include: { user: { select: { email: true } } },
        });

        const aggregate = await tx.review.aggregate({
          where: { productId },
          _avg: { rating: true },
          _count: { _all: true },
        });
        await tx.product.update({
          where: { id: productId },
          data: {
            avgRating: Math.round((aggregate._avg.rating ?? 0) * 10) / 10,
            reviewCount: aggregate._count._all,
          },
        });

        return created;
      });

      return CatalogService.toReviewView(review);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // The first review stands untouched — the whole transaction rolled back.
        throw new ConflictException('You have already reviewed this product.');
      }
      throw error;
    }
  }

  /** Eligibility: the user owns a delivered order containing this product. */
  private async hasDeliveredPurchase(productId: string, userId: string): Promise<boolean> {
    const item = await this.prisma.orderItem.findFirst({
      where: { productId, order: { userId, status: OrderStatus.delivered } },
      select: { id: true },
    });
    return item !== null;
  }
}
