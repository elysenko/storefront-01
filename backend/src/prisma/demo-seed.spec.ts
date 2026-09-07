/**
 * Seed-assertion test for the guarded demo/staging catalog seed
 * (`prisma/seed/demo-seed.js`, not the essential `seed.js`). Verifies the
 * OpenSpec "Seed data" scenario counts — 4 categories, 12 products (2 out of
 * stock, one "Wireless Headphones"), 3 reviews, 1 delivered order — and that
 * running the seed twice never duplicates a row (idempotency), using a mocked
 * Prisma client so this runs as a fast unit test with no live database.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  CATEGORY_NAMES,
  REVIEW_PRODUCT_NAMES,
  SEED_ORDER_PRODUCT_NAME,
  SEED_ORDER_SHIP_ADDRESS,
  buildDemoProducts,
  seedCategories,
  seedProducts,
  seedReviews,
  seedDeliveredOrder,
} = require('../../prisma/seed/demo-seed.js');

describe('demo-seed data shape', () => {
  it('defines exactly the 4 spec categories', () => {
    expect(CATEGORY_NAMES).toEqual(['Electronics', 'Home', 'Books', 'Sports']);
  });

  it('defines 12 products, 3 per category', () => {
    const products = buildDemoProducts();
    expect(products).toHaveLength(12);
    for (const name of CATEGORY_NAMES) {
      expect(products.filter((p: { category: string }) => p.category === name)).toHaveLength(3);
    }
  });

  it('has exactly 2 out-of-stock products', () => {
    const outOfStock = buildDemoProducts().filter((p: { stockQty: number }) => p.stockQty === 0);
    expect(outOfStock).toHaveLength(2);
  });

  it('includes "Wireless Headphones" in Electronics', () => {
    const headphones = buildDemoProducts().find(
      (p: { name: string }) => p.name === 'Wireless Headphones',
    );
    expect(headphones).toMatchObject({ category: 'Electronics' });
  });

  it('reviews 3 distinct products, none of which is the seeded order product', () => {
    expect(REVIEW_PRODUCT_NAMES).toHaveLength(3);
    expect(new Set(REVIEW_PRODUCT_NAMES).size).toBe(3);
    expect(REVIEW_PRODUCT_NAMES).not.toContain(SEED_ORDER_PRODUCT_NAME);
  });
});

/** A minimal in-memory Prisma stand-in, just enough for the seed's read/write shape. */
function makeMockPrisma() {
  const categories: Array<{ id: string; name: string }> = [];
  const products: Array<{ id: string; name: string; categoryId: string; [k: string]: unknown }> =
    [];
  const reviews: Array<{ productId: string; userId: string; rating: number }> = [];
  const orders: Array<{ userId: string; shipAddress: string }> = [];
  let nextId = 1;

  return {
    calls: { productCreate: 0, reviewUpsert: 0, orderCreate: 0 },
    category: {
      upsert: jest.fn(async ({ where, create }: any) => {
        let category = categories.find((c) => c.name === where.name);
        if (!category) {
          category = { id: `cat-${nextId++}`, name: create.name };
          categories.push(category);
        }
        return category;
      }),
    },
    product: {
      findFirst: jest.fn(async ({ where }: any) =>
        products.find((p) => p.name === where.name && p.categoryId === where.categoryId) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const product = { id: `prod-${nextId++}`, ...data };
        products.push(product);
        return product;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const product = products.find((p) => p.id === where.id);
        Object.assign(product, data);
        return product;
      }),
    },
    review: {
      upsert: jest.fn(async ({ where, create }: any) => {
        const key = where.productId_userId;
        let review = reviews.find((r) => r.productId === key.productId && r.userId === key.userId);
        if (!review) {
          review = { productId: create.productId, userId: create.userId, rating: create.rating };
          reviews.push(review);
        }
        return review;
      }),
      aggregate: jest.fn(async ({ where }: any) => {
        const matching = reviews.filter((r) => r.productId === where.productId);
        const avg = matching.reduce((sum, r) => sum + r.rating, 0) / (matching.length || 1);
        return { _avg: { rating: matching.length ? avg : null }, _count: { _all: matching.length } };
      }),
    },
    order: {
      findFirst: jest.fn(async ({ where }: any) =>
        orders.find((o) => o.userId === where.userId && o.shipAddress === where.shipAddress) ??
        null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const order = { id: `order-${nextId++}`, userId: data.userId, shipAddress: data.shipAddress };
        orders.push(order);
        return order;
      }),
    },
    _state: { categories, products, reviews, orders },
  };
}

describe('demo-seed idempotency (mocked Prisma, two runs)', () => {
  const REVIEWER_ID = 'shopper-1';

  async function runOnce(prisma: ReturnType<typeof makeMockPrisma>) {
    const idByName = await seedCategories(prisma);
    const products = await seedProducts(prisma, idByName);
    const reviewCount = await seedReviews(prisma, products, REVIEWER_ID);
    const order = await seedDeliveredOrder(prisma, products, REVIEWER_ID);
    return { products, reviewCount, order };
  }

  it('produces the spec counts on the first run', async () => {
    const prisma = makeMockPrisma();
    const { products, reviewCount, order } = await runOnce(prisma);

    expect(prisma._state.categories).toHaveLength(4);
    expect(products).toHaveLength(12);
    expect(reviewCount).toBe(3);
    expect(prisma._state.reviews).toHaveLength(3);
    expect(order).not.toBeNull();
    expect(prisma._state.orders).toHaveLength(1);
  });

  it('does not duplicate any row when run a second time', async () => {
    const prisma = makeMockPrisma();
    await runOnce(prisma);
    await runOnce(prisma);

    expect(prisma._state.categories).toHaveLength(4);
    expect(prisma._state.products).toHaveLength(12);
    expect(prisma._state.reviews).toHaveLength(3);
    expect(prisma._state.orders).toHaveLength(1);

    // The second pass found every category/product/review/order already present,
    // so it never issued a second `create` for any of them.
    expect(prisma.product.create).toHaveBeenCalledTimes(12);
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
  });
});
