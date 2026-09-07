import { NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import type { PrismaService } from '../prisma/prisma.service';

const productRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Trail Kettle',
  description: 'Boils water outdoors.',
  priceCents: 4599,
  imageUrl: 'https://images.example.test/kettle.jpg',
  stockQty: 3,
  categoryId: 'c1',
  category: { id: 'c1', name: 'Outdoors' },
  avgRating: 4.5,
  reviewCount: 2,
  deletedAt: null,
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  ...over,
});

describe('CatalogService', () => {
  let prisma: {
    category: { findMany: jest.Mock };
    product: { count: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
    review: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: CatalogService;

  beforeEach(() => {
    prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      product: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      review: { findMany: jest.fn().mockResolvedValue([]) },
      // The real client resolves the array of promises; the mock just awaits them.
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    service = new CatalogService(prisma as unknown as PrismaService);
  });

  const whereOf = (): Record<string, unknown> =>
    prisma.product.findMany.mock.calls[0][0].where as Record<string, unknown>;

  it('never returns soft-deleted products from browse', async () => {
    await service.listProducts({});
    expect(whereOf().deletedAt).toBeNull();
  });

  it('searches names case-insensitively and composes with the category filter', async () => {
    await service.listProducts({ q: '  kettle ', categoryId: 'c1' });
    expect(whereOf()).toEqual({
      deletedAt: null,
      name: { contains: 'kettle', mode: 'insensitive' },
      categoryId: 'c1',
    });
  });

  it('ignores a blank search term instead of matching everything on ""', async () => {
    await service.listProducts({ q: '   ' });
    expect(whereOf().name).toBeUndefined();
  });

  it('defaults to 12 rows on page 1 and pages with skip/take', async () => {
    await service.listProducts({});
    expect(prisma.product.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 12 });

    prisma.product.findMany.mockClear();
    const page = await service.listProducts({ page: 3, pageSize: 5 });
    expect(prisma.product.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 5 });
    expect(page).toMatchObject({ page: 3, pageSize: 5 });
  });

  it('counts against the same filter it lists with, inside one transaction', async () => {
    prisma.product.count.mockResolvedValue(37);
    prisma.product.findMany.mockResolvedValue([productRow()]);

    const result = await service.listProducts({ q: 'kettle' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.product.count.mock.calls[0][0].where).toEqual(whereOf());
    expect(result.total).toBe(37);
    expect(result.items).toHaveLength(1);
  });

  it('derives inStock and flattens the category name for the SPA', async () => {
    prisma.product.count.mockResolvedValue(2);
    prisma.product.findMany.mockResolvedValue([
      productRow({ id: 'in', stockQty: 1 }),
      productRow({ id: 'out', stockQty: 0 }),
    ]);

    const { items } = await service.listProducts({});

    expect(items[0]).toMatchObject({ id: 'in', inStock: true, categoryName: 'Outdoors' });
    expect(items[1]).toMatchObject({ id: 'out', inStock: false });
  });

  it('404s a product id that is missing or soft-deleted', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.getProduct('gone')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'gone',
      deletedAt: null,
    });
  });

  it('returns a live product with its reviews newest first', async () => {
    prisma.product.findFirst.mockResolvedValue(productRow());
    prisma.review.findMany.mockResolvedValue([
      {
        id: 'r1',
        productId: 'p1',
        userId: 'u1',
        user: { email: 'shopper@example.test' },
        rating: 5,
        body: 'Boils fast.',
        createdAt: new Date('2026-02-02T00:00:00.000Z'),
      },
    ]);

    const product = await service.getProduct('p1');

    expect(prisma.review.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    expect(product.reviews[0]).toMatchObject({ rating: 5, userEmail: 'shopper@example.test' });
  });
});
