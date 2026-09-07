'use strict';
/**
 * Optional demo/staging catalog seed — NOT part of the essential platform seed.
 *
 * `prisma/seed/seed.js` is essential-only (Colossus accounts-v1 contract): it
 * upserts platform-minted logins from `COLOSSUS_ACCOUNTS_JSON` and never carries
 * business fixtures. The build gate flags a seed script that writes inline rows
 * with no environment guard (`unguarded-seed-fixture`), so this script — which
 * exists to satisfy the OpenSpec "Seed data" scenario (12 products across 4
 * categories, 2 out of stock, 3 reviews, 1 delivered order) for demo/staging
 * deploys — is deliberately:
 *
 *   1. A SEPARATE file the essential seed never calls (not referenced by the
 *      `prisma.seed` key in package.json, not run by the Dockerfile CMD, and
 *      not part of the deploy pipeline's migrate Job).
 *   2. Guarded: a no-op unless `SEED_DEMO_CATALOG=true` is set explicitly.
 *   3. Run on purpose for demo/staging via:
 *
 *        SEED_DEMO_CATALOG=true npm run seed:demo
 *
 * It writes catalog content only — categories, products, reviews, one delivered
 * order — and never a `User` or `colossus_accounts` row. Reviews and the order
 * attach to whichever platform-minted account already holds the `USER` role
 * (materialized by seed.js from `COLOSSUS_ACCOUNTS_JSON`); if no such account
 * exists yet, the catalog is still seeded and the review/order step is skipped
 * rather than inventing a login the platform cannot verify.
 *
 * Idempotent throughout: categories upsert by their unique `name`; products,
 * reviews and the order are existence-guarded before any write, so running this
 * twice never duplicates a row or double-counts `avgRating`.
 */
const { PrismaClient, Role, OrderStatus } = require('@prisma/client');

const DEMO_FLAG = 'SEED_DEMO_CATALOG';

const prisma = new PrismaClient();

/** The spec's four categories, in display order. */
const CATEGORY_NAMES = ['Electronics', 'Home', 'Books', 'Sports'];

/** 12 products, 3 per category, exactly 2 out of stock. One Electronics item
 *  is named "Wireless Headphones" per the seed-data scenario's search example. */
function buildDemoProducts() {
  return [
    // Electronics
    {
      name: 'Wireless Headphones',
      category: 'Electronics',
      description: 'Over-ear Bluetooth headphones with active noise cancellation.',
      priceCents: 12900,
      imageUrl: 'https://images.storefront-catalog.test/wireless-headphones.jpg',
      stockQty: 25,
    },
    {
      name: '4K Streaming Stick',
      category: 'Electronics',
      description: 'Compact HDMI streaming device with a voice remote.',
      priceCents: 4999,
      imageUrl: 'https://images.storefront-catalog.test/streaming-stick.jpg',
      stockQty: 40,
    },
    {
      name: 'Portable Power Bank',
      category: 'Electronics',
      description: '20,000 mAh USB-C fast-charging power bank.',
      priceCents: 3499,
      imageUrl: 'https://images.storefront-catalog.test/power-bank.jpg',
      stockQty: 0,
    },
    // Home
    {
      name: 'Trail Kettle',
      category: 'Home',
      description: 'One-litre stainless kettle for stovetop or camp stove.',
      priceCents: 4599,
      imageUrl: 'https://images.storefront-catalog.test/trail-kettle.jpg',
      stockQty: 18,
    },
    {
      name: 'Ceramic Dinner Set',
      category: 'Home',
      description: '16-piece stoneware dinnerware set, service for four.',
      priceCents: 5999,
      imageUrl: 'https://images.storefront-catalog.test/dinner-set.jpg',
      stockQty: 12,
    },
    {
      name: 'Memory Foam Pillow',
      category: 'Home',
      description: 'Contoured memory foam pillow with a cooling gel layer.',
      priceCents: 2999,
      imageUrl: 'https://images.storefront-catalog.test/pillow.jpg',
      stockQty: 0,
    },
    // Books
    {
      name: 'The Silent Orchard',
      category: 'Books',
      description: 'A literary mystery set in a coastal orchard town.',
      priceCents: 1599,
      imageUrl: 'https://images.storefront-catalog.test/silent-orchard.jpg',
      stockQty: 60,
    },
    {
      name: 'Cooking with Fire',
      category: 'Books',
      description: 'A cookbook of live-fire and grill recipes.',
      priceCents: 2299,
      imageUrl: 'https://images.storefront-catalog.test/cooking-with-fire.jpg',
      stockQty: 35,
    },
    {
      name: 'Atlas of Old Roads',
      category: 'Books',
      description: 'An illustrated history of long-distance trade routes.',
      priceCents: 3299,
      imageUrl: 'https://images.storefront-catalog.test/atlas-old-roads.jpg',
      stockQty: 20,
    },
    // Sports
    {
      name: 'Trail Running Shoes',
      category: 'Sports',
      description: 'Lightweight trail runners with grippy lug soles.',
      priceCents: 8999,
      imageUrl: 'https://images.storefront-catalog.test/trail-shoes.jpg',
      stockQty: 22,
    },
    {
      name: 'Adjustable Dumbbell Pair',
      category: 'Sports',
      description: 'A pair of dumbbells adjustable from 5 to 25 lbs each.',
      priceCents: 14900,
      imageUrl: 'https://images.storefront-catalog.test/dumbbells.jpg',
      stockQty: 10,
    },
    {
      name: 'Insulated Water Bottle',
      category: 'Sports',
      description: '1L double-wall insulated stainless bottle.',
      priceCents: 1999,
      imageUrl: 'https://images.storefront-catalog.test/water-bottle.jpg',
      stockQty: 50,
    },
  ];
}

/** Upserts the 4 categories by their unique name. Returns { name: id }. */
async function seedCategories(client) {
  const idByName = {};
  for (const name of CATEGORY_NAMES) {
    const category = await client.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    idByName[name] = category.id;
  }
  return idByName;
}

/** Existence-guarded product creation (Product.name has no unique constraint,
 *  so idempotency is enforced here rather than via upsert). */
async function seedProducts(client, categoryIdByName) {
  const products = [];
  for (const def of buildDemoProducts()) {
    const categoryId = categoryIdByName[def.category];
    let product = await client.product.findFirst({ where: { name: def.name, categoryId } });
    if (!product) {
      product = await client.product.create({
        data: {
          name: def.name,
          categoryId,
          description: def.description,
          priceCents: def.priceCents,
          imageUrl: def.imageUrl,
          stockQty: def.stockQty,
        },
      });
    }
    products.push(product);
  }
  return products;
}

/** Three products carry a seeded review, leaving the order's product unreviewed
 *  so the review flow stays exercisable end-to-end. */
const REVIEW_PRODUCT_NAMES = ['Wireless Headphones', 'Trail Kettle', 'The Silent Orchard'];
const REVIEW_BODIES = {
  'Wireless Headphones':
    'Noise cancellation is excellent and the battery easily lasts a full week of commuting.',
  'Trail Kettle': 'Boils fast on a camp stove and the handle stays cool to the touch.',
  'The Silent Orchard': 'A slow-burn mystery with a terrific sense of place.',
};

/** Upserts one review per product (unique on productId+userId), then recomputes
 *  avgRating/reviewCount from the aggregate — mirrors ReviewsService.create(). */
async function seedReviews(client, products, reviewerId) {
  const byName = new Map(products.map((product) => [product.name, product]));
  let count = 0;
  for (const name of REVIEW_PRODUCT_NAMES) {
    const product = byName.get(name);
    if (!product) {
      continue;
    }
    await client.review.upsert({
      where: { productId_userId: { productId: product.id, userId: reviewerId } },
      update: {},
      create: {
        productId: product.id,
        userId: reviewerId,
        rating: 5,
        body: REVIEW_BODIES[name],
      },
    });
    count += 1;

    const aggregate = await client.review.aggregate({
      where: { productId: product.id },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await client.product.update({
      where: { id: product.id },
      data: {
        avgRating: Math.round((aggregate._avg.rating ?? 0) * 10) / 10,
        reviewCount: aggregate._count._all,
      },
    });
  }
  return count;
}

const SEED_ORDER_PRODUCT_NAME = 'Trail Running Shoes';
const SEED_ORDER_SHIP_ADDRESS = '100 Market Street, Springfield';

/** Existence-guarded: matched on (userId, shipAddress) so re-running never
 *  creates a second delivered order. */
async function seedDeliveredOrder(client, products, shopperId) {
  const existing = await client.order.findFirst({
    where: { userId: shopperId, shipAddress: SEED_ORDER_SHIP_ADDRESS },
  });
  if (existing) {
    return existing;
  }
  const product = products.find((candidate) => candidate.name === SEED_ORDER_PRODUCT_NAME);
  if (!product) {
    return null;
  }
  return client.order.create({
    data: {
      userId: shopperId,
      status: OrderStatus.delivered,
      totalCents: product.priceCents,
      shipName: 'Storefront Seed Order',
      shipAddress: SEED_ORDER_SHIP_ADDRESS,
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            imageUrl: product.imageUrl,
            unitPriceCents: product.priceCents,
            qty: 1,
          },
        ],
      },
    },
  });
}

async function main() {
  if (process.env[DEMO_FLAG] !== 'true') {
    console.log(
      `[demo-seed] ${DEMO_FLAG} is not "true" — skipping. This script never runs on the ` +
        'production seed path; set the flag and run `npm run seed:demo` for a demo/staging deploy.',
    );
    return;
  }

  const categoryIdByName = await seedCategories(prisma);
  const products = await seedProducts(prisma, categoryIdByName);

  const shopper = await prisma.user.findFirst({
    where: { role: Role.USER },
    orderBy: { createdAt: 'asc' },
  });
  if (!shopper) {
    console.log(
      `[demo-seed] catalog seeded (categories=${CATEGORY_NAMES.length} products=${products.length}); ` +
        'no USER-role account exists yet (essential seed has not run), skipping reviews and the order.',
    );
    return;
  }

  const reviewCount = await seedReviews(prisma, products, shopper.id);
  const order = await seedDeliveredOrder(prisma, products, shopper.id);
  console.log(
    `[demo-seed] done: categories=${CATEGORY_NAMES.length} products=${products.length} ` +
      `reviews=${reviewCount} order=${order ? 1 : 0}`,
  );
}

module.exports = {
  DEMO_FLAG,
  CATEGORY_NAMES,
  REVIEW_PRODUCT_NAMES,
  SEED_ORDER_PRODUCT_NAME,
  SEED_ORDER_SHIP_ADDRESS,
  buildDemoProducts,
  seedCategories,
  seedProducts,
  seedReviews,
  seedDeliveredOrder,
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[demo-seed] failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
