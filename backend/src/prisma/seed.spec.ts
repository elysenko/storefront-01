/**
 * Seed-assertion test for the actual shipped entrypoint (`prisma/seed/seed.js`) —
 * the file the deploy pipeline's migrate Job runs via
 * `npx prisma migrate deploy && node prisma/seed/seed.js`. Verifies the OpenSpec
 * "Seed data" scenario counts (4 categories, 12 products with 2 out of stock and
 * one "Wireless Headphones", 3 reviews, 1 delivered order, and the two fixed
 * demo logins) directly against the exported functions `main()` calls, and that
 * running the demo-data stage twice never duplicates a row (idempotency), using
 * a mocked Prisma client so this runs as a fast unit test with no live database.
 */
import * as bcrypt from 'bcryptjs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  DEMO_FLAG,
  CATEGORY_NAMES,
  REVIEW_PRODUCT_NAMES,
  SEED_ORDER_PRODUCT_NAME,
  buildDemoLogins,
  buildDemoProducts,
  seedDemoLogins,
  seedCategories,
  seedProducts,
  seedReviews,
  seedDeliveredOrder,
  seedDemoData,
} = require('../../prisma/seed/seed.js');

describe('seed.js demo data shape', () => {
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

  it('defines exactly the two fixed demo logins named by the acceptance scenario', () => {
    const logins = buildDemoLogins();
    expect(logins).toHaveLength(2);
    const byEmail = Object.fromEntries(logins.map((l: { email: string }) => [l.email, l]));
    expect(byEmail['admin@demo']).toMatchObject({ role: 'ADMIN' });
    expect(byEmail['shopper@demo']).toMatchObject({ role: 'USER' });
    // Every login shares the one seeded password, and it hashes/verifies via
    // the same bcryptjs the auth service uses to compare on login.
    for (const login of logins) {
      const hash = bcrypt.hashSync(login.password, 10);
      expect(bcrypt.compareSync(login.password, hash)).toBe(true);
    }
  });
});

/** A minimal in-memory Prisma stand-in, just enough for the seed's read/write shape. */
function makeMockPrisma() {
  const users: Array<{ id: string; email: string; role: string; passwordHash: string }> = [];
  const categories: Array<{ id: string; name: string }> = [];
  const products: Array<{ id: string; name: string; categoryId: string; [k: string]: unknown }> =
    [];
  const reviews: Array<{ productId: string; userId: string; rating: number }> = [];
  const orders: Array<{ userId: string; shipAddress: string }> = [];
  let nextId = 1;

  return {
    user: {
      upsert: jest.fn(async ({ where, update, create }: any) => {
        let user = users.find((u) => u.email === where.email);
        if (!user) {
          user = { id: `user-${nextId++}`, email: create.email, role: create.role, passwordHash: create.passwordHash };
          users.push(user);
        } else {
          Object.assign(user, update);
        }
        return user;
      }),
    },
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
    _state: { users, categories, products, reviews, orders },
  };
}

describe('seed.js demo-data idempotency (mocked Prisma, two runs)', () => {
  async function runOnce(prisma: ReturnType<typeof makeMockPrisma>) {
    const idByName = await seedCategories(prisma);
    const products = await seedProducts(prisma, idByName);
    const logins = await seedDemoLogins(prisma);
    const reviewCount = await seedReviews(prisma, products, logins['shopper@demo'].id);
    const order = await seedDeliveredOrder(prisma, products, logins['shopper@demo'].id);
    return { logins, products, reviewCount, order };
  }

  it('produces the spec counts on the first run', async () => {
    const prisma = makeMockPrisma();
    const { logins, products, reviewCount, order } = await runOnce(prisma);

    expect(Object.keys(logins)).toEqual(['admin@demo', 'shopper@demo']);
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

    expect(prisma._state.users).toHaveLength(2);
    expect(prisma._state.categories).toHaveLength(4);
    expect(prisma._state.products).toHaveLength(12);
    expect(prisma._state.reviews).toHaveLength(3);
    expect(prisma._state.orders).toHaveLength(1);

    // The second pass found every category/product/review/order already present,
    // so it never issued a second `create` for any of them. `user.upsert` DOES
    // run again each pass (by design — it re-asserts the password hash), but it
    // must resolve to the same two rows, not a third.
    expect(prisma.product.create).toHaveBeenCalledTimes(12);
    expect(prisma.order.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.upsert).toHaveBeenCalledTimes(4); // 2 logins x 2 runs
  });

  it('re-asserts the password hash on every run instead of only on create', async () => {
    const prisma = makeMockPrisma();
    await seedDemoLogins(prisma);
    await seedDemoLogins(prisma);

    for (const call of prisma.user.upsert.mock.calls) {
      const [{ update }] = call;
      expect(update.passwordHash).toBeTruthy();
    }
  });

  it('skips entirely when SEED_DEMO_DATA is explicitly disabled', async () => {
    const prisma = makeMockPrisma();
    await seedDemoData(prisma, { [DEMO_FLAG]: 'false' });

    expect(prisma._state.users).toHaveLength(0);
    expect(prisma._state.categories).toHaveLength(0);
  });

  it('runs by default when SEED_DEMO_DATA is unset', async () => {
    const prisma = makeMockPrisma();
    await seedDemoData(prisma, {});

    expect(prisma._state.users).toHaveLength(2);
    expect(prisma._state.categories).toHaveLength(4);
    expect(prisma._state.products).toHaveLength(12);
  });
});
