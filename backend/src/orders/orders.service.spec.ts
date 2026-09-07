import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import type { PrismaService } from '../prisma/prisma.service';

const product = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Wireless Headphones',
  priceCents: 12900,
  imageUrl: 'https://images.example.test/headphones.jpg',
  stockQty: 5,
  deletedAt: null,
  ...over,
});

const createdOrder = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  userId: 'u1',
  user: { email: 'shopper@example.test' },
  status: OrderStatus.placed,
  totalCents: 25800,
  shipName: 'A Shopper',
  shipAddress: '1 Example Way',
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  items: [],
  ...over,
});

describe('OrdersService', () => {
  let tx: {
    cart: { findUnique: jest.Mock };
    order: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
    product: { updateMany: jest.Mock };
    cartItem: { deleteMany: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    order: { findMany: jest.Mock; findFirst: jest.Mock };
  };
  let service: OrdersService;

  beforeEach(() => {
    tx = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart1',
          items: [{ id: 'l1', productId: 'p1', qty: 2, product: product() }],
        }),
      },
      order: {
        create: jest.fn().mockResolvedValue(createdOrder()),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      $transaction: jest.fn((work: (client: unknown) => Promise<unknown>) => work(tx)),
      order: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    };
    service = new OrdersService(prisma as unknown as PrismaService);
  });

  const checkout = () =>
    service.checkout('u1', { shipName: ' A Shopper ', shipAddress: ' 1 Example Way ' });

  it('places the order, freezes the line prices and empties the cart in one transaction', async () => {
    const order = await checkout();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.status).toBe(OrderStatus.placed);
    expect(data.totalCents).toBe(25800);
    expect(data.shipName).toBe('A Shopper');
    expect(data.items.create[0]).toEqual({
      productId: 'p1',
      productName: 'Wireless Headphones',
      imageUrl: 'https://images.example.test/headphones.jpg',
      unitPriceCents: 12900,
      qty: 2,
    });
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart1' } });
    expect(order.status).toBe(OrderStatus.placed);
  });

  it('decrements stock conditionally so two concurrent checkouts cannot oversell', async () => {
    await checkout();

    expect(tx.product.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'p1', stockQty: { gte: 2 } },
      data: { stockQty: { decrement: 2 } },
    });
  });

  it('aborts with a 400 naming the product when the decrement finds no rows', async () => {
    tx.product.updateMany.mockResolvedValue({ count: 0 });

    const error = await checkout().catch((caught: BadRequestException) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain('Wireless Headphones');
    // Same transaction, so the order create above is rolled back with it.
    expect(tx.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects checkout when a line now exceeds stock, before creating anything', async () => {
    tx.cart.findUnique.mockResolvedValue({
      id: 'cart1',
      items: [{ id: 'l1', productId: 'p1', qty: 4, product: product({ stockQty: 3 }) }],
    });

    const error = await checkout().catch((caught: BadRequestException) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain('Wireless Headphones');
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('rejects checkout of a product soft-deleted since it was carted', async () => {
    tx.cart.findUnique.mockResolvedValue({
      id: 'cart1',
      items: [{ id: 'l1', productId: 'p1', qty: 1, product: product({ deletedAt: new Date() }) }],
    });

    await expect(checkout()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('rejects checkout of an empty cart', async () => {
    tx.cart.findUnique.mockResolvedValue({ id: 'cart1', items: [] });
    await expect(checkout()).rejects.toBeInstanceOf(BadRequestException);

    tx.cart.findUnique.mockResolvedValue(null);
    await expect(checkout()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes order history to the caller, newest first', async () => {
    await service.listForUser('u1');

    expect(prisma.order.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('reads another shopper’s order as 404, never 403', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(service.getOne('o1', 'someone-else', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.order.findFirst.mock.calls[0][0].where).toEqual({
      id: 'o1',
      userId: 'someone-else',
    });
  });

  it('lets an admin read any order without the ownership filter', async () => {
    prisma.order.findFirst.mockResolvedValue(createdOrder());

    const order = await service.getOne('o1', 'admin-id', true);

    expect(prisma.order.findFirst.mock.calls[0][0].where).toEqual({ id: 'o1' });
    expect(order.userEmail).toBe('shopper@example.test');
  });
});
