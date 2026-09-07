import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { AdminService, nextStatus } from './admin.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('nextStatus', () => {
  it('walks placed -> shipped -> delivered and stops there', () => {
    expect(nextStatus(OrderStatus.placed)).toBe(OrderStatus.shipped);
    expect(nextStatus(OrderStatus.shipped)).toBe(OrderStatus.delivered);
    expect(nextStatus(OrderStatus.delivered)).toBeNull();
  });
});

describe('AdminService', () => {
  let prisma: {
    product: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; create: jest.Mock };
    cartItem: { deleteMany: jest.Mock };
    order: { findUnique: jest.Mock; update: jest.Mock };
    category: { findUnique: jest.Mock; create: jest.Mock };
  };
  let service: AdminService;

  beforeEach(() => {
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1', deletedAt: null }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({
          id: 'p1',
          deletedAt: new Date('2026-04-01T00:00:00.000Z'),
        }),
        create: jest.fn(),
      },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      order: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: { data: { status: OrderStatus } }) =>
          Promise.resolve({ id: 'o1', status: data.status }),
        ),
      },
      category: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };
    service = new AdminService(prisma as unknown as PrismaService);
  });

  describe('advanceOrderStatus', () => {
    const orderAt = (status: OrderStatus): void => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', status });
    };

    it('advances one step forward', async () => {
      orderAt(OrderStatus.placed);
      await expect(service.advanceOrderStatus('o1', OrderStatus.shipped)).resolves.toBe(
        OrderStatus.shipped,
      );

      orderAt(OrderStatus.shipped);
      await expect(service.advanceOrderStatus('o1', OrderStatus.delivered)).resolves.toBe(
        OrderStatus.delivered,
      );
    });

    it('rejects skipping a step, naming the attempted transition', async () => {
      orderAt(OrderStatus.placed);

      const error = await service
        .advanceOrderStatus('o1', OrderStatus.delivered)
        .catch((caught: BadRequestException) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('placed');
      expect((error as BadRequestException).message).toContain('delivered');
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('rejects going backwards (delivered -> placed)', async () => {
      orderAt(OrderStatus.delivered);

      await expect(service.advanceOrderStatus('o1', OrderStatus.placed)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('rejects re-applying the current status', async () => {
      orderAt(OrderStatus.shipped);

      await expect(service.advanceOrderStatus('o1', OrderStatus.shipped)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('404s an unknown order id', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.advanceOrderStatus('nope', OrderStatus.shipped)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deleteProduct', () => {
    it('soft-deletes so historical order lines keep their relation', async () => {
      const result = await service.deleteProduct('p1');

      expect(prisma.product.update.mock.calls[0][0].where).toEqual({ id: 'p1' });
      expect(prisma.product.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
      expect(result.deletedAt).toBe('2026-04-01T00:00:00.000Z');
      // Live carts drop the line; placed orders are untouched.
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { productId: 'p1' } });
    });

    it('404s a product that is already deleted', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.deleteProduct('p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  it('lists admin products excluding the soft-deleted ones', async () => {
    await service.listProducts('  kettle ');

    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      name: { contains: 'kettle', mode: 'insensitive' },
    });
  });

  it('refuses a product create pointing at a category that does not exist', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(
      service.createProduct({
        name: 'Trail Kettle',
        categoryId: 'missing',
        description: 'Boils water.',
        priceCents: 4599,
        imageUrl: 'https://images.example.test/kettle.jpg',
        stockQty: 4,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
});
