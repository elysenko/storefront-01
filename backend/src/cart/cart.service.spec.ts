import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';
import type { PrismaService } from '../prisma/prisma.service';

const product = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Wireless Headphones',
  priceCents: 12900,
  imageUrl: 'https://images.example.test/headphones.jpg',
  stockQty: 3,
  deletedAt: null,
  ...over,
});

describe('CartService', () => {
  let prisma: {
    cart: { findUnique: jest.Mock; create: jest.Mock };
    cartItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    product: { findFirst: jest.Mock };
  };
  let service: CartService;

  beforeEach(() => {
    prisma = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cart1' }),
        create: jest.fn().mockResolvedValue({ id: 'cart1' }),
      },
      cartItem: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      product: { findFirst: jest.fn().mockResolvedValue(product()) },
    };
    service = new CartService(prisma as unknown as PrismaService);
  });

  it('creates the cart on first use, keyed on userId so it survives sign-out', async () => {
    prisma.cart.findUnique.mockResolvedValue(null);

    await service.getOrCreateCart('u1');

    expect(prisma.cart.findUnique.mock.calls[0][0].where).toEqual({ userId: 'u1' });
    expect(prisma.cart.create.mock.calls[0][0].data).toEqual({ userId: 'u1' });
  });

  it('reuses the existing cart on a later sign-in instead of making a second one', async () => {
    await service.getOrCreateCart('u1');
    expect(prisma.cart.create).not.toHaveBeenCalled();
  });

  it('sums quantity into the existing line rather than adding a duplicate', async () => {
    prisma.cartItem.findUnique.mockResolvedValue({ id: 'line1', qty: 1 });

    await service.addItem('u1', { productId: 'p1', qty: 2 });

    expect(prisma.cartItem.create).not.toHaveBeenCalled();
    expect(prisma.cartItem.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'line1' },
      data: { qty: 3 },
    });
  });

  it('rejects a quantity beyond stock with a 400 naming the product, writing nothing', async () => {
    prisma.cartItem.findUnique.mockResolvedValue({ id: 'line1', qty: 2 });

    // stock is 3, cart already holds 2, adding 2 more would be 4.
    const error = await service
      .addItem('u1', { productId: 'p1', qty: 2 })
      .catch((caught: BadRequestException) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain('Wireless Headphones');
    // The existing quantity is left exactly as it was.
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
    expect(prisma.cartItem.create).not.toHaveBeenCalled();
  });

  it('refuses to add an out-of-stock product', async () => {
    prisma.product.findFirst.mockResolvedValue(product({ stockQty: 0 }));

    await expect(service.addItem('u1', { productId: 'p1', qty: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('404s an add for a product that has been soft-deleted', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.addItem('u1', { productId: 'gone', qty: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.product.findFirst.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
  });

  it('rejects a PATCH to zero — removal goes through DELETE', async () => {
    prisma.cartItem.findFirst.mockResolvedValue({ id: 'line1', qty: 2, product: product() });

    await expect(service.updateItem('u1', 'line1', { qty: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
  });

  it('scopes a line mutation to the caller’s own cart', async () => {
    prisma.cartItem.findFirst.mockResolvedValue(null);

    await expect(service.updateItem('u1', 'someone-elses-line', { qty: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cartItem.findFirst.mock.calls[0][0].where).toEqual({
      id: 'someone-elses-line',
      cartId: 'cart1',
    });
  });

  it('totals the cart from live product prices', async () => {
    prisma.cartItem.findMany.mockResolvedValue([
      { id: 'l1', cartId: 'cart1', productId: 'p1', qty: 2, product: product() },
      {
        id: 'l2',
        cartId: 'cart1',
        productId: 'p2',
        qty: 1,
        product: product({ id: 'p2', name: 'Trail Kettle', priceCents: 4599 }),
      },
    ]);

    const view = await service.view('u1');

    expect(view.items[0].lineTotalCents).toBe(25800);
    expect(view.totalCents).toBe(25800 + 4599);
    expect(view.count).toBe(3);
  });
});
