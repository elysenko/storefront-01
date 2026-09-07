/**
 * Preview fixtures.
 *
 * Everything the API will eventually supply is hardcoded here so the mockup is
 * fully populated with no server. The stores wrap these in `signal<T[]>([...])`
 * so the service layer can swap each initializer for a real request.
 *
 * Denormalized `avgRating` / `reviewCount` on each product are kept consistent
 * with MOCK_REVIEWS, exactly as the API recomputes them per review write.
 */
import type { Category, Order, Product, Review, SystemSetting, User } from './models';
import { productImage } from './product-image';

export const MOCK_CATEGORIES: Category[] = [
  { id: 'c1', name: 'Electronics' },
  { id: 'c2', name: 'Home' },
  { id: 'c3', name: 'Books' },
  { id: 'c4', name: 'Sports' },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Wireless Headphones',
    description:
      'Over-ear active noise cancelling headphones with 38-hour battery life, multipoint Bluetooth pairing and a folding travel case. Memory-foam earcups stay comfortable across long flights.',
    priceCents: 12999,
    imageUrl: productImage('electronics', 'Wireless Headphones'),
    stockQty: 12,
    categoryId: 'c1',
    categoryName: 'Electronics',
    avgRating: 4.5,
    reviewCount: 2,
    deletedAt: null,
  },
  {
    id: 'p2',
    name: '4K Action Camera',
    description:
      'Pocket-sized 4K60 action camera, waterproof to 10m without a housing, with in-body stabilisation and a front-facing framing screen.',
    priceCents: 24900,
    imageUrl: productImage('electronics', '4K Action Camera'),
    stockQty: 7,
    categoryId: 'c1',
    categoryName: 'Electronics',
    avgRating: 4,
    reviewCount: 1,
    deletedAt: null,
  },
  {
    id: 'p3',
    name: 'Mechanical Keyboard',
    description:
      'Compact 75% hot-swap mechanical keyboard with tactile switches, PBT double-shot keycaps and a gasket-mounted plate for a softer typing feel.',
    priceCents: 8950,
    imageUrl: productImage('electronics', 'Mechanical Keyboard'),
    stockQty: 0,
    categoryId: 'c1',
    categoryName: 'Electronics',
    avgRating: 4.5,
    reviewCount: 2,
    deletedAt: null,
  },
  {
    id: 'p4',
    name: 'Ceramic Pour-Over Set',
    description:
      'Hand-glazed ceramic dripper, 600ml carafe and a reusable stainless filter. Brews two cups at a time with no paper waste.',
    priceCents: 4200,
    imageUrl: productImage('home', 'Ceramic Pour Over'),
    stockQty: 18,
    categoryId: 'c2',
    categoryName: 'Home',
    avgRating: 5,
    reviewCount: 1,
    deletedAt: null,
  },
  {
    id: 'p5',
    name: 'Linen Duvet Cover',
    description:
      'Stonewashed European flax duvet cover with hidden coconut-shell buttons. Gets softer with every wash and breathes through summer.',
    priceCents: 11900,
    imageUrl: productImage('home', 'Linen Duvet'),
    stockQty: 5,
    categoryId: 'c2',
    categoryName: 'Home',
    avgRating: 0,
    reviewCount: 0,
    deletedAt: null,
  },
  {
    id: 'p6',
    name: 'Cast Iron Skillet',
    description:
      'Pre-seasoned 12-inch cast iron skillet with a helper handle and dual pour spouts. Oven-safe to 260C and effectively immortal.',
    priceCents: 6495,
    imageUrl: productImage('home', 'Cast Iron Skillet'),
    stockQty: 23,
    categoryId: 'c2',
    categoryName: 'Home',
    avgRating: 4.5,
    reviewCount: 2,
    deletedAt: null,
  },
  {
    id: 'p7',
    name: 'The Quiet Algorithm',
    description:
      'A field guide to designing software that stays out of the way, told through eight case studies of systems that got quieter as they grew. 384 pages, hardcover.',
    priceCents: 1899,
    imageUrl: productImage('books', 'Quiet Algorithm'),
    stockQty: 34,
    categoryId: 'c3',
    categoryName: 'Books',
    avgRating: 3,
    reviewCount: 1,
    deletedAt: null,
  },
  {
    id: 'p8',
    name: 'Atlas of Small Cities',
    description:
      'Sixty hand-drawn maps of cities under 100,000 people, each paired with an essay on how its streets came to be shaped that way.',
    priceCents: 3600,
    imageUrl: productImage('books', 'Atlas Small Cities'),
    stockQty: 9,
    categoryId: 'c3',
    categoryName: 'Books',
    avgRating: 0,
    reviewCount: 0,
    deletedAt: null,
  },
  {
    id: 'p9',
    name: 'Winter Orchard',
    description:
      'A novel about three seasons on a failing apple farm in the Pacific Northwest, and the daughter who comes home to close it down.',
    priceCents: 1450,
    imageUrl: productImage('books', 'Winter Orchard'),
    stockQty: 0,
    categoryId: 'c3',
    categoryName: 'Books',
    avgRating: 0,
    reviewCount: 0,
    deletedAt: null,
  },
  {
    id: 'p10',
    name: 'Trail Running Shoes',
    description:
      'Aggressive 5mm lugs, a rock plate underfoot and a quick-drying mesh upper. Built for wet roots and loose descents rather than groomed paths.',
    priceCents: 13400,
    imageUrl: productImage('sports', 'Trail Running Shoes'),
    stockQty: 11,
    categoryId: 'c4',
    categoryName: 'Sports',
    avgRating: 0,
    reviewCount: 0,
    deletedAt: null,
  },
  {
    id: 'p11',
    name: 'Yoga Mat Pro',
    description:
      'Closed-cell 6mm mat with an alignment grid and a grippy top layer that keeps traction through hot classes. Latex-free.',
    priceCents: 5800,
    imageUrl: productImage('sports', 'Yoga Mat Pro'),
    stockQty: 26,
    categoryId: 'c4',
    categoryName: 'Sports',
    avgRating: 5,
    reviewCount: 1,
    deletedAt: null,
  },
  {
    id: 'p12',
    name: 'Insulated Bottle 1L',
    description:
      'Double-walled vacuum flask that holds ice for 24 hours and coffee hot for 12. Wide mouth, dishwasher-safe lid, no plastic taste.',
    priceCents: 2999,
    imageUrl: productImage('sports', 'Insulated Bottle'),
    stockQty: 41,
    categoryId: 'c4',
    categoryName: 'Sports',
    avgRating: 0,
    reviewCount: 0,
    deletedAt: null,
  },
];

export const MOCK_REVIEWS: Review[] = [
  { id: 'r1', productId: 'p1', userId: 'u3', userEmail: 'ada@example.com', rating: 5, body: 'The noise cancelling genuinely works on a plane. Wore them Sydney to Vancouver and never touched the charger.', createdAt: '2026-08-28T09:14:00Z' },
  { id: 'r2', productId: 'p1', userId: 'u4', userEmail: 'marcus@example.com', rating: 4, body: 'Excellent sound and comfort. Docking a star because the case is bulkier than it needs to be.', createdAt: '2026-08-19T17:02:00Z' },
  { id: 'r3', productId: 'p2', userId: 'u5', userEmail: 'nina@example.com', rating: 4, body: 'Stabilisation is the real story here — handheld footage looks gimballed. Battery life in cold weather is average.', createdAt: '2026-08-25T12:41:00Z' },
  { id: 'r4', productId: 'p3', userId: 'u6', userEmail: 'sam@example.com', rating: 5, body: 'Hot-swap sockets meant I could try three switch types in an evening. The gasket mount makes a real difference.', createdAt: '2026-08-30T20:08:00Z' },
  { id: 'r5', productId: 'p3', userId: 'u7', userEmail: 'priya@example.com', rating: 4, body: 'Fantastic board. Wish the arrow cluster were full-size, but that is the price of 75%.', createdAt: '2026-08-11T08:33:00Z' },
  { id: 'r6', productId: 'p4', userId: 'u8', userEmail: 'lena@example.com', rating: 5, body: 'Replaced my paper filters entirely. The carafe pours without dribbling, which is rarer than it should be.', createdAt: '2026-09-01T07:20:00Z' },
  { id: 'r7', productId: 'p6', userId: 'u9', userEmail: 'tomas@example.com', rating: 5, body: 'Arrived properly seasoned and non-stick from the first egg. Heavy in the best way.', createdAt: '2026-08-22T18:55:00Z' },
  { id: 'r8', productId: 'p6', userId: 'u3', userEmail: 'ada@example.com', rating: 4, body: 'Great skillet, just be aware the helper handle still gets hot — use both mitts.', createdAt: '2026-08-05T14:10:00Z' },
  { id: 'r9', productId: 'p7', userId: 'u5', userEmail: 'nina@example.com', rating: 3, body: 'The case studies are strong but the middle third repeats itself. Worth it for chapters two and seven.', createdAt: '2026-08-17T11:27:00Z' },
  { id: 'r10', productId: 'p11', userId: 'u4', userEmail: 'marcus@example.com', rating: 5, body: 'The alignment grid fixed my crooked downward dog. Grip holds up once the mat is wet.', createdAt: '2026-08-27T06:45:00Z' },
];

/** Demo accounts. Passwords are never stored client-side, in code or in comments. */
export const MOCK_USERS: User[] = [
  { id: 'u1', email: 'admin@demo', role: 'admin' },
  { id: 'u2', email: 'shopper@demo', role: 'shopper' },
];

export const DEMO_SHOPPER: User = MOCK_USERS[1];
export const DEMO_ADMIN: User = MOCK_USERS[0];

const img = (id: string): string => MOCK_PRODUCTS.find((p) => p.id === id)?.imageUrl ?? '';

export const MOCK_ORDERS: Order[] = [
  {
    id: 'o1004',
    userId: 'u2',
    userEmail: 'shopper@demo',
    status: 'delivered',
    totalCents: 16399,
    shipName: 'Dana Whitfield',
    shipAddress: '18 Harbour Lane, Apt 6\nWellington 6011\nNew Zealand',
    createdAt: '2026-08-14T10:05:00Z',
    items: [
      { id: 'oi1', orderId: 'o1004', productId: 'p10', productName: 'Trail Running Shoes', imageUrl: img('p10'), unitPriceCents: 13400, qty: 1 },
      { id: 'oi2', orderId: 'o1004', productId: 'p12', productName: 'Insulated Bottle 1L', imageUrl: img('p12'), unitPriceCents: 2999, qty: 1 },
    ],
  },
  {
    id: 'o1007',
    userId: 'u2',
    userEmail: 'shopper@demo',
    status: 'shipped',
    totalCents: 10695,
    shipName: 'Dana Whitfield',
    shipAddress: '18 Harbour Lane, Apt 6\nWellington 6011\nNew Zealand',
    createdAt: '2026-08-31T15:48:00Z',
    items: [
      { id: 'oi3', orderId: 'o1007', productId: 'p6', productName: 'Cast Iron Skillet', imageUrl: img('p6'), unitPriceCents: 6495, qty: 1 },
      { id: 'oi4', orderId: 'o1007', productId: 'p4', productName: 'Ceramic Pour-Over Set', imageUrl: img('p4'), unitPriceCents: 4200, qty: 1 },
    ],
  },
  {
    id: 'o1011',
    userId: 'u2',
    userEmail: 'shopper@demo',
    status: 'placed',
    totalCents: 5798,
    shipName: 'Dana Whitfield',
    shipAddress: '18 Harbour Lane, Apt 6\nWellington 6011\nNew Zealand',
    createdAt: '2026-09-05T08:12:00Z',
    items: [
      { id: 'oi5', orderId: 'o1011', productId: 'p12', productName: 'Insulated Bottle 1L', imageUrl: img('p12'), unitPriceCents: 2999, qty: 1 },
      { id: 'oi6', orderId: 'o1011', productId: 'p7', productName: 'The Quiet Algorithm', imageUrl: img('p7'), unitPriceCents: 1899, qty: 1 },
      { id: 'oi7', orderId: 'o1011', productId: 'p9', productName: 'Winter Orchard', imageUrl: img('p9'), unitPriceCents: 1450, qty: 1 },
    ],
  },
  {
    id: 'o1009',
    userId: 'u3',
    userEmail: 'ada@example.com',
    status: 'placed',
    totalCents: 25999,
    shipName: 'Ada Kesler',
    shipAddress: '402 Rennick Street\nPortland, OR 97209\nUnited States',
    createdAt: '2026-09-03T19:31:00Z',
    items: [
      { id: 'oi8', orderId: 'o1009', productId: 'p2', productName: '4K Action Camera', imageUrl: img('p2'), unitPriceCents: 24900, qty: 1 },
      { id: 'oi9', orderId: 'o1009', productId: 'p12', productName: 'Insulated Bottle 1L', imageUrl: img('p12'), unitPriceCents: 2999, qty: 1 },
    ],
  },
  {
    id: 'o1006',
    userId: 'u4',
    userEmail: 'marcus@example.com',
    status: 'shipped',
    totalCents: 24798,
    shipName: 'Marcus Oyelaran',
    shipAddress: '7 Beaumont Terrace\nBristol BS8 2QE\nUnited Kingdom',
    createdAt: '2026-08-29T13:02:00Z',
    items: [
      { id: 'oi10', orderId: 'o1006', productId: 'p1', productName: 'Wireless Headphones', imageUrl: img('p1'), unitPriceCents: 12999, qty: 1 },
      { id: 'oi11', orderId: 'o1006', productId: 'p5', productName: 'Linen Duvet Cover', imageUrl: img('p5'), unitPriceCents: 11900, qty: 1 },
    ],
  },
  {
    id: 'o1002',
    userId: 'u5',
    userEmail: 'nina@example.com',
    status: 'delivered',
    totalCents: 8398,
    shipName: 'Nina Barsotti',
    shipAddress: '55 Via Cavour\n50129 Firenze FI\nItaly',
    createdAt: '2026-08-08T09:44:00Z',
    items: [
      { id: 'oi12', orderId: 'o1002', productId: 'p4', productName: 'Ceramic Pour-Over Set', imageUrl: img('p4'), unitPriceCents: 4200, qty: 1 },
      { id: 'oi13', orderId: 'o1002', productId: 'p11', productName: 'Yoga Mat Pro', imageUrl: img('p11'), unitPriceCents: 5800, qty: 1 },
    ],
  },
];

/**
 * Products the signed-in shopper may review: bought on a delivered order and
 * not yet reviewed by them. Mirrors the API's eligibility rule.
 */
export const REVIEWABLE_PRODUCT_IDS: string[] = ['p10', 'p12'];

export const MOCK_SETTINGS: SystemSetting[] = [
  { key: 'DATABASE_URL', label: 'Connection string', service: 'postgresql', value: 'postgresql://storefront:••••••••@postgres:5432/storefront', configured: true, secret: true },
  { key: 'POSTGRES_MAX_CONNECTIONS', label: 'Max connections', service: 'postgresql', value: '20', configured: true, secret: false },
  { key: 'MINIO_ENDPOINT', label: 'Endpoint', service: 'minio', value: 'http://minio:9000', configured: true, secret: false },
  { key: 'MINIO_ACCESS_KEY', label: 'Access key', service: 'minio', value: '', configured: false, secret: true },
  { key: 'MINIO_SECRET_KEY', label: 'Secret key', service: 'minio', value: '', configured: false, secret: true },
  { key: 'MINIO_BUCKET', label: 'Bucket', service: 'minio', value: 'storefront-media', configured: true, secret: false },
];

export const SERVICE_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL',
  minio: 'MinIO object storage',
};
