'use strict';
/**
 * Seed entrypoint. Runs with plain `node` from the production image (no
 * ts-node/tsx): the deploy pipeline's migrate Job executes
 * `npx prisma migrate deploy && node prisma/seed/seed.js` (also wired as the
 * `prisma.seed` key in package.json so `npx prisma db seed` resolves here).
 *
 * Two independent, idempotent stages:
 *
 *  1. Platform accounts (Colossus accounts-v1, essential). Reads
 *     COLOSSUS_ACCOUNTS_JSON — injected into the pod env by Colossus at
 *     provision: a JSON array with one entry per contract role, each carrying
 *     role/email/password/login_path. Upserts one `colossus_accounts` row AND
 *     one `User` per entry, hashing with bcryptjs exactly as the auth service
 *     verifies it. Re-asserts the hash on every run so the platform-held
 *     password always logs in. Prints one roles-only summary line — never an
 *     email, password or hash.
 *
 *  2. Demo data (OpenSpec "Seed data" acceptance scenario), gated by the
 *     SEED_DEMO_DATA env var (defaults on; the Dockerfile sets it explicitly
 *     for this single-environment app since the scenario is normative here).
 *     Set SEED_DEMO_DATA=false to skip it. Upserts the two fixed shopper/admin
 *     logins the scenario names, the 4-category / 12-product catalog (2 out of
 *     stock, one "Wireless Headphones" in Electronics), 3 reviews, and 1
 *     delivered order. Every write is an upsert or existence-guarded, so
 *     re-running never duplicates a row or drifts `avgRating`. This stage
 *     writes only `User` rows for its two logins — never a `colossus_accounts`
 *     row, which stays a pure mirror of platform-minted accounts.
 */
const { PrismaClient, Role, OrderStatus } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const ACCOUNTS_ENV = 'COLOSSUS_ACCOUNTS_JSON';
const DEMO_FLAG = 'SEED_DEMO_DATA';
const BCRYPT_ROUNDS = 10;
const DEFAULT_LOGIN_PATH = '/login';
const REQUIRED_FIELDS = ['role', 'email', 'password'];

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Stage 1: platform accounts (Colossus accounts-v1) — unchanged essential path
// ---------------------------------------------------------------------------

/** Parse and validate the platform accounts from the environment; throws a value-free error. */
function readPlatformAccounts(env) {
  const raw = env[ACCOUNTS_ENV];
  if (!raw || !raw.trim()) {
    throw new Error(`${ACCOUNTS_ENV} is not set — Colossus injects it at provision; nothing to seed`);
  }
  let accounts;
  try {
    accounts = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${ACCOUNTS_ENV} is not valid JSON (${error.message})`);
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error(`${ACCOUNTS_ENV} must be a non-empty JSON array of accounts`);
  }
  accounts.forEach((account, index) => {
    for (const field of REQUIRED_FIELDS) {
      if (typeof account[field] !== 'string' || account[field] === '') {
        throw new Error(`${ACCOUNTS_ENV}[${index}] is missing field "${field}"`);
      }
    }
  });
  return accounts;
}

/** Map a contract role (any case) onto the app's Prisma `Role` enum, or throw listing the known ones. */
function resolveAppRole(contractRole) {
  const known = Object.values(Role);
  const match = known.find((value) => value.toUpperCase() === contractRole.toUpperCase());
  if (!match) {
    throw new Error(`contract role "${contractRole}" has no Role enum value (known: ${known.join(', ')})`);
  }
  return match;
}

/** Upsert the colossus_accounts row and the matching User for one platform account. */
async function upsertAccount(client, account) {
  const role = resolveAppRole(account.role);
  const passwordHash = await bcrypt.hash(account.password, BCRYPT_ROUNDS);
  const loginPath = account.login_path || DEFAULT_LOGIN_PATH;
  await client.colossusAccount.upsert({
    where: { email: account.email },
    update: { role: account.role, passwordHash, loginPath },
    create: { role: account.role, email: account.email, passwordHash, loginPath },
  });
  await client.user.upsert({
    where: { email: account.email },
    update: { role, passwordHash },
    create: { email: account.email, name: `${role} (Colossus)`, role, passwordHash },
  });
  return role;
}

async function seedPlatformAccounts(client, env) {
  const accounts = readPlatformAccounts(env);
  const roles = [];
  for (const account of accounts) {
    roles.push(await upsertAccount(client, account));
  }
  console.log(`[seed] colossus_accounts upserted ${roles.length} (roles: ${roles.join(', ')})`);
}

// ---------------------------------------------------------------------------
// Stage 2: demo data — OpenSpec "Seed data" acceptance scenario
// ---------------------------------------------------------------------------

/** The two fixed logins the acceptance scenario names, independent of whatever
 *  COLOSSUS_ACCOUNTS_JSON happens to contain. Plain Users only — never written
 *  to colossus_accounts. */
function buildDemoLogins() {
  return [
    { email: 'admin@demo', password: 'Demo1234!', role: Role.ADMIN },
    { email: 'shopper@demo', password: 'Demo1234!', role: Role.USER },
  ];
}

/** Upserts the fixed demo logins, re-asserting the password hash on every run. Returns { email: User }. */
async function seedDemoLogins(client) {
  const byEmail = {};
  for (const login of buildDemoLogins()) {
    const passwordHash = await bcrypt.hash(login.password, BCRYPT_ROUNDS);
    byEmail[login.email] = await client.user.upsert({
      where: { email: login.email },
      update: { passwordHash, role: login.role },
      create: {
        email: login.email,
        name: `Storefront ${login.role === Role.ADMIN ? 'admin' : 'shopper'}`,
        role: login.role,
        passwordHash,
      },
    });
  }
  return byEmail;
}

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

/** Runs the demo-data stage unless explicitly disabled via SEED_DEMO_DATA=false. */
async function seedDemoData(client, env) {
  if (env[DEMO_FLAG] === 'false') {
    console.log(`[seed] ${DEMO_FLAG}=false — skipping demo logins/catalog.`);
    return;
  }

  const logins = await seedDemoLogins(client);
  const categoryIdByName = await seedCategories(client);
  const products = await seedProducts(client, categoryIdByName);
  const shopper = logins['shopper@demo'];
  const reviewCount = await seedReviews(client, products, shopper.id);
  const order = await seedDeliveredOrder(client, products, shopper.id);
  console.log(
    `[seed] demo data: logins=${Object.keys(logins).length} categories=${CATEGORY_NAMES.length} ` +
      `products=${products.length} reviews=${reviewCount} order=${order ? 1 : 0}`,
  );
}

// ---------------------------------------------------------------------------

async function main() {
  await seedPlatformAccounts(prisma, process.env);
  await seedDemoData(prisma, process.env);
}

module.exports = {
  ACCOUNTS_ENV,
  DEMO_FLAG,
  CATEGORY_NAMES,
  REVIEW_PRODUCT_NAMES,
  SEED_ORDER_PRODUCT_NAME,
  SEED_ORDER_SHIP_ADDRESS,
  readPlatformAccounts,
  resolveAppRole,
  buildDemoLogins,
  buildDemoProducts,
  seedDemoLogins,
  seedCategories,
  seedProducts,
  seedReviews,
  seedDeliveredOrder,
  seedDemoData,
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[seed] failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
