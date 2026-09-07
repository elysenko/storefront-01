import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import type { CatalogService } from '../catalog/catalog.service';
import type { PrismaService } from '../prisma/prisma.service';

const duplicateReview = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('ReviewsService', () => {
  let tx: {
    review: { create: jest.Mock; aggregate: jest.Mock };
    product: { update: jest.Mock };
  };
  let prisma: {
    product: { findFirst: jest.Mock };
    review: { findUnique: jest.Mock };
    orderItem: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let catalog: { listReviews: jest.Mock };
  let service: ReviewsService;

  beforeEach(() => {
    tx = {
      review: {
        create: jest.fn().mockResolvedValue({
          id: 'r1',
          productId: 'p1',
          userId: 'u1',
          user: { email: 'shopper@example.test' },
          rating: 4,
          body: 'Good kettle.',
          createdAt: new Date('2026-03-02T00:00:00.000Z'),
        }),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.25 }, _count: { _all: 4 } }),
      },
      product: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', deletedAt: null }) },
      review: { findUnique: jest.fn().mockResolvedValue(null) },
      orderItem: { findFirst: jest.fn().mockResolvedValue({ id: 'oi1' }) },
      $transaction: jest.fn((work: (client: unknown) => Promise<unknown>) => work(tx)),
    };
    catalog = { listReviews: jest.fn().mockResolvedValue([]) };
    service = new ReviewsService(
      prisma as unknown as PrismaService,
      catalog as unknown as CatalogService,
    );
  });

  describe('eligibility', () => {
    it('reports signed-out for an anonymous visitor', async () => {
      await expect(service.eligibility('p1')).resolves.toEqual({
        eligible: false,
        reason: 'signed-out',
      });
    });

    it('reports not-purchased without a delivered order for the product', async () => {
      prisma.orderItem.findFirst.mockResolvedValue(null);

      await expect(service.eligibility('p1', 'u1')).resolves.toEqual({
        eligible: false,
        reason: 'not-purchased',
      });
      expect(prisma.orderItem.findFirst.mock.calls[0][0].where).toEqual({
        productId: 'p1',
        order: { userId: 'u1', status: OrderStatus.delivered },
      });
    });

    it('reports already-reviewed once the shopper has one review on the product', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'r1' });

      await expect(service.eligibility('p1', 'u1')).resolves.toEqual({
        eligible: false,
        reason: 'already-reviewed',
      });
    });

    it('reports eligible for a delivered purchase with no review yet', async () => {
      await expect(service.eligibility('p1', 'u1')).resolves.toEqual({
        eligible: true,
        reason: 'ok',
      });
    });
  });

  describe('create', () => {
    const dto = { rating: 4, body: '  Good kettle.  ' };

    it('403s a shopper who has not received the product', async () => {
      prisma.orderItem.findFirst.mockResolvedValue(null);

      await expect(service.create('p1', 'u1', dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404s a review on a soft-deleted product', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.create('p1', 'u1', dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recomputes avgRating and reviewCount from the aggregate in the same transaction', async () => {
      const review = await service.create('p1', 'u1', dto);

      expect(tx.review.create.mock.calls[0][0].data).toMatchObject({
        productId: 'p1',
        userId: 'u1',
        rating: 4,
        body: 'Good kettle.',
      });
      expect(tx.product.update.mock.calls[0][0]).toEqual({
        where: { id: 'p1' },
        data: { avgRating: 4.3, reviewCount: 4 },
      });
      expect(review).toMatchObject({ rating: 4, userEmail: 'shopper@example.test' });
    });

    it('resets avgRating to 0 rather than NaN when the aggregate is empty', async () => {
      tx.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });

      await service.create('p1', 'u1', dto);

      expect(tx.product.update.mock.calls[0][0].data).toEqual({ avgRating: 0, reviewCount: 0 });
    });

    it('409s a second review and leaves the first one untouched', async () => {
      tx.review.create.mockRejectedValue(duplicateReview());

      await expect(service.create('p1', 'u1', dto)).rejects.toBeInstanceOf(ConflictException);
      // The whole transaction rolled back, so no denormalized counter was moved.
      expect(tx.product.update).not.toHaveBeenCalled();
    });
  });
});
