# Pipeline Task Decomposition

## Summary
Storefront is a single-tenant, Amazon-shaped e-commerce application delivered as one container: a NestJS 10 + Prisma/Postgres API (global prefix `/api`) that also serves a built Angular 19 standalone SPA from `client/` via `ServeStaticModule`. Shoppers browse and search a paginated catalog, view product detail with reviews and star ratings, manage a persistent server-side cart keyed on `userId`, check out with transactional stock re-validation and decrement, and track order status (`placed → shipped → delivered`). Admins manage products (create/edit/soft-delete), advance order status, and configure backing-service credentials from an admin settings console. Auth is JWT (HS256, 7-day expiry, `sub`/`email`/`role`) with two roles — `admin` and `shopper` (the `user` role of the `full_auth` model) — sharing a single `/login` screen. Money is integer cents end to end; `avgRating`/`reviewCount` are denormalized on `Product` and recomputed inside the same transaction as every review write.

## Surface contract

### API routes (all prefixed `/api`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | public | `{status:'ok'}` (liveness) |
| GET | `/api/health/deep` | public | `SELECT 1`; 503 on DB failure (readiness) |
| POST | `/api/auth/signup` | public | bcrypt cost 10; always `role=shopper`; 409 duplicate email |
| POST | `/api/auth/login` | public | 401 on bad credentials |
| GET | `/api/auth/me` | jwt | current user `{id,email,role}` |
| GET | `/api/categories` | public | all categories |
| GET | `/api/products` | public (optional jwt) | `?q=&categoryId=&page=&pageSize=`; 12/page; `deletedAt=null`; returns `{items,total,page,pageSize}` |
| GET | `/api/products/:id` | public (optional jwt) | category + reviews (reviewer email, newest first); 404 if missing/soft-deleted |
| GET | `/api/products/:id/reviews` | public | review list |
| POST | `/api/products/:id/reviews` | jwt | 400 rating outside 1–5; 403 not delivered-purchased; 409 duplicate |
| GET | `/api/cart` | jwt | lines with `lineTotalCents` + cart `totalCents` |
| POST | `/api/cart/items` | jwt | upsert by `(cartId, productId)` summing qty; 400 over stock |
| PATCH | `/api/cart/items/:id` | jwt | 400 if `qty > stockQty` or `qty < 1` |
| DELETE | `/api/cart/items/:id` | jwt | remove line |
| POST | `/api/orders` | jwt | `{shipName, shipAddress}`; transactional; 400 empty cart / short stock |
| GET | `/api/orders` | jwt | own orders, `createdAt desc`, with items |
| GET | `/api/orders/:id` | jwt | own, or any if admin; else 404 |
| POST | `/api/admin/products` | admin | 403 for shopper |
| PATCH | `/api/admin/products/:id` | admin | |
| DELETE | `/api/admin/products/:id` | admin | soft delete → `deletedAt` |
| GET | `/api/admin/orders` | admin | `?status=`; joined shopper email; newest first |
| PATCH | `/api/admin/orders/:id/status` | admin | only `placed→shipped→delivered`; 400 names attempted transition |
| GET | `/api/admin/settings` | admin | service keys with masked values + configured status |
| PATCH | `/api/admin/settings` | admin | upsert key/value pairs |

### SPA routes (each carries `data.flow`)
`''` → catalog (`catalog.browse`, renders directly — **no redirect**, `?q=`, `?category=`, `?page=`) · `products/:id` (`catalog.product`, `?tab=description|reviews`, `?modal=review`) · `login` (`auth.login`) · `signup` (`auth.signup`) · `cart` (`cart.view`, authGuard) · `checkout` (`checkout.flow`, authGuard, `?step=shipping|review`) · `orders` (`orders.history`, `?status=`) · `orders/:id` (`orders.detail`, authGuard) · `admin/products` (`admin.products`, `?q=`, `?modal=delete&id=`) · `admin/products/new` (`admin.productCreate`) · `admin/products/:id/edit` (`admin.productEdit`) · `admin/orders` (`admin.orders`, `?status=`) · `admin/settings` (`admin.settings`) — admin routes use `[authGuard, adminGuard]` · `**` → catalog.

### Entities
`User(id, email, passwordHash, role: Role)` · `Category(id, name)` · `Product(id, name, description, priceCents, imageUrl, stockQty, categoryId, avgRating Float @default(0), reviewCount Int @default(0), deletedAt DateTime?)` · `Review(id, productId, userId, rating, body, createdAt)` · `Cart(id, userId @unique)` · `CartItem(id, cartId, productId, qty)` · `Order(id, userId, status: OrderStatus, totalCents, shipName, shipAddress, createdAt)` · `OrderItem(id, orderId, productId String?, productName, unitPriceCents, qty)` · `SystemSetting(key @id, value, updatedAt)`.
Enums: `Role { shopper admin }`, `OrderStatus { placed shipped delivered }`.

### Always-visible UI invariants
Header renders the literal text **"Storefront"** on every page. Catalog product cards show name, category, formatted price, star rating and an **"In stock" / "Out of stock"** label.

## db_agent tasks
- [ ] Create `api/prisma/schema.prisma` with the Postgres datasource (`env("DATABASE_URL")`), `prisma-client-js` generator, and enums `Role { shopper admin }` and `OrderStatus { placed shipped delivered }` (`shopper` is the `full_auth` USER role; `admin` is the ADMIN role).
- [ ] Add `User` model — `id`, `email @unique`, `passwordHash`, `role Role @default(shopper)`, `createdAt` — plus `Category` model (`id`, `name @unique`, `products Product[]`).
- [ ] Add `Product` model — `name`, `description`, `priceCents Int`, `imageUrl`, `stockQty Int`, `categoryId` relation, `avgRating Float @default(0)`, `reviewCount Int @default(0)`, `deletedAt DateTime?` — with `@@index([name])` and `@@index([categoryId])`.
- [ ] Add `Review` model — `productId`, `userId`, `rating Int`, `body`, `createdAt` — with `@@unique([productId, userId])` and cascade on product delete.
- [ ] Add `Cart` (`userId String @unique`, relation to User) and `CartItem` (`cartId`, `productId`, `qty Int`) with `@@unique([cartId, productId])`.
- [ ] Add `Order` (`userId`, `status OrderStatus @default(placed)`, `totalCents Int`, `shipName`, `shipAddress`, `createdAt`) with `@@index([userId])` and `@@index([createdAt])`, and `OrderItem` (`orderId`, `productId String?` with `onDelete: SetNull`, frozen `productName`, `unitPriceCents Int`, `qty Int`).
- [ ] Add `SystemSetting` model — `key String @id`, `value String`, `updatedAt DateTime @updatedAt` — backing runtime credential config for the `postgresql` and `minio` deployments.
- [ ] Generate the initial migration under `api/prisma/migrations/` and verify `prisma migrate deploy` applies cleanly against a fresh Postgres 16 database.
- [ ] Write idempotent `api/prisma/seed.ts`: upsert categories Electronics/Home/Books/Sports; upsert users `admin@demo` (admin) and `shopper@demo` (shopper) with password `Demo1234!`; upsert 12 products (3 per category, each with description + `imageUrl`, **exactly 2 with `stockQty: 0`**, one named `Wireless Headphones` in Electronics).
- [ ] Extend `seed.ts` with existence-guarded creation of 3 reviews (recomputing `avgRating`/`reviewCount` explicitly) and one `delivered` order for `shopper@demo` whose `OrderItem.productId` references an unreviewed product; register the `prisma.seed` block in `api/package.json`.

## backend_agent tasks
- [ ] Create `api/` Nest project files (`package.json`, `tsconfig.json`, `nest-cli.json`, `.eslintrc.cjs`) pinning `@nestjs/*@^10`, `prisma`/`@prisma/client`, `bcryptjs`, `class-validator`, `class-transformer`, `passport-jwt`; dev deps `jest`, `supertest`, `ts-node`.
- [ ] Write `api/src/main.ts` — `setGlobalPrefix('api')`, global `ValidationPipe({ whitelist: true, transform: true })`, listen on `process.env.PORT ?? 3000`.
- [ ] Write `api/src/prisma/prisma.module.ts` + `prisma.service.ts` (`PrismaService extends PrismaClient` with `onModuleInit` connect, exported globally).
- [ ] Write `api/src/health/health.controller.ts` — `GET /api/health` returns `{status:'ok'}`; `GET /api/health/deep` runs `SELECT 1` and returns 503 on failure.
- [ ] Write `api/src/auth/` core — `auth.module.ts`, `auth.service.ts`, `auth.controller.ts` with `POST /api/auth/signup` (bcrypt cost 10, 409 duplicate email, role forced to `shopper`, never client-settable), `POST /api/auth/login` (401 on bad credentials), `GET /api/auth/me`; DTOs `dto/signup.dto.ts`, `dto/login.dto.ts`.
- [ ] Write `api/src/auth/` guards — `jwt.strategy.ts` (HS256, 7d, `sub`/`email`/`role` claims), `jwt-auth.guard.ts`, `optional-jwt.guard.ts`, `roles.guard.ts` returning **403** for a shopper on an admin route, plus `roles.decorator.ts` and `current-user.decorator.ts`.
- [ ] Write `api/src/catalog/` — `GET /api/categories`; `GET /api/products` with `dto/query-products.dto.ts` (`q`, `categoryId`, `page`, `pageSize` default 12), `q` via `contains` + `mode:'insensitive'` on `name`, always `where.deletedAt = null`, returning `{items,total,page,pageSize}` with `avgRating`, `stockQty`, `inStock`, category name; `GET /api/products/:id` including category + reviews (reviewer email, newest first), 404 when missing or soft-deleted.
- [ ] Write `api/src/reviews/` — public `GET /api/products/:id/reviews`; authenticated `POST /api/products/:id/reviews` with `@IsInt() @Min(1) @Max(5)` (400 outside range), delivered-order eligibility check on `OrderItem.productId` (403 otherwise), unique-violation → **409** leaving the first review unchanged, and transactional insert + recompute of `avgRating`/`reviewCount` from aggregate.
- [ ] Write `api/src/cart/` — all routes under `JwtAuthGuard`, lazily create the user's `Cart`; `GET /api/cart` (lines with `lineTotalCents`, cart `totalCents`), `POST /api/cart/items` (upsert by `(cartId, productId)` summing qty), `PATCH /api/cart/items/:id`, `DELETE /api/cart/items/:id`; reject resulting `qty > product.stockQty` or `qty < 1` with **400 naming the product**, leaving existing qty unchanged.
- [ ] Write `api/src/orders/` — `POST /api/orders {shipName, shipAddress}` inside one `prisma.$transaction`: load cart lines (400 if empty), re-check every line against current `stockQty` (400 naming the first product short), create `Order(status:'placed', totalCents)` + `OrderItem`s freezing `productName`/`unitPriceCents`/`productId`, decrement `Product.stockQty`, delete all `CartItem`s; `GET /api/orders` (own only, `createdAt desc`, with items); `GET /api/orders/:id` (own, or any if admin, else 404).
- [ ] Write `api/src/admin/admin-products.controller.ts` + DTOs — `@Roles('admin')`; `POST /api/admin/products`, `PATCH /api/admin/products/:id`, `DELETE /api/admin/products/:id` setting `deletedAt` (soft delete leaves orders and reviews untouched).
- [ ] Write `api/src/admin/admin-orders.controller.ts` + `dto/update-order-status.dto.ts` — `GET /api/admin/orders?status=` (every order joined to shopper email, newest first) and `PATCH /api/admin/orders/:id/status` allowing only `placed→shipped→delivered`, returning **400 naming the attempted transition** for any backwards or skipping change.
- [ ] Write `api/src/lib/config.ts` exporting `resolveConfig(key: string): Promise<string | null>` — reads `process.env[key]` first; falls back to the `SystemSetting` row when the env value is absent or equals `PLACEHOLDER_CONFIGURE_IN_SETTINGS`; returns `null` if neither is set. Export `ServiceUnconfiguredError` mapping to HTTP 503.
- [ ] Add admin settings endpoints to `api/src/admin/` — `GET /api/admin/settings` listing the credential keys for each provisioned service (`postgresql`, `minio`) with masked values and a configured/unconfigured flag, and `PATCH /api/admin/settings` upserting key/value pairs into `SystemSetting`; both `@Roles('admin')`.
- [ ] Wire `api/src/app.module.ts` — `ConfigModule.forRoot({isGlobal:true})`, `PrismaModule`, all feature modules, and `ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'client'), exclude: ['/api*'] })` with index.html fallback so deep links survive a hard refresh.
- [ ] Write `Dockerfile` (3 stages: web build → api build → slim Node 20 runtime carrying `dist/`, prod `node_modules`, `prisma/`, and the Angular browser bundle at `client/`; `EXPOSE 3000`), `docker-entrypoint.sh` (`prisma migrate deploy` → `prisma db seed` → `node dist/main.js`), and `.dockerignore`.
- [ ] Write `docker-compose.yml` (Postgres 16 + app with healthcheck-gated dependency), `.gitignore`, `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `PORT=3000`), and `k8s/{postgres,deployment,service,ingress,secret.example}.yaml` with probes on `/api/health` (liveness) and `/api/health/deep` (readiness), Service + Ingress → port 3000.
- [ ] Replace the `README.md` stub with setup instructions, env var table, demo credentials (`admin@demo` / `shopper@demo`, `Demo1234!`), and local dev commands.

## ui_agent tasks
- [ ] Create `web/` Angular 19 standalone project files — `package.json`, `angular.json` (output `dist/storefront-web/browser`, SCSS, no SSR), `tsconfig.json`, `tailwind.config.js`, `postcss` config, `src/styles.scss`, `src/index.html` with `<title>Storefront</title>`, `src/main.ts`, `src/app/app.component.ts`.
- [ ] Write `web/src/app/app.routes.ts` — every route from the surface contract with its `data.flow` value; `''` renders `CatalogComponent` **directly with no redirect**; `**` falls back to catalog; guards applied per contract.
- [ ] Write `web/src/app/layout/header.component.ts` — brand renders the literal text **"Storefront"** on every page, plus search box, category nav, cart count badge, and role-conditional links (Orders; Admin Products / Admin Orders / Admin Settings) — and `footer.component.ts`.
- [ ] Write `pages/catalog/` — binds `q`/`category`/`page` query params, shows the active category name, renders a 12-per-page grid with pagination, plus empty / loading / error states.
- [ ] Write `shared/product-card.component.ts` (name, category, formatted price, star rating, **"In stock" / "Out of stock"** label) and `shared/star-rating.component.ts` (renders a `Float` average).
- [ ] Write `pages/product-detail/` — image, description, formatted price, stock label, average rating, review list, `?tab=description|reviews` tab state, quantity selector capped at `stockQty`, "Add to cart" hidden/disabled when out of stock or signed out (prompting sign-in).
- [ ] Write `shared/review-form.component.ts` (1–5 stars + text) and `shared/modal.component.ts`; `?modal=review` opens the form only when the API reports eligibility, surfacing 400 and 409 responses inline.
- [ ] Write `pages/login/` — shared login screen for both roles (no separate `/admin/login`), honouring `?redirect=<url>` after success, with inline 401 error state.
- [ ] Write `pages/signup/` — email/password form, inline 409 duplicate-email error, redirect to catalog on success.
- [ ] Write `pages/cart/` — line list with qty stepper, line totals, remove action, cart total, refresh after every mutation, inline stock-cap error naming the product, and an empty-cart state.
- [ ] Write `pages/checkout/` — `?step=shipping` collects `shipName`/`shipAddress`, `?step=review` shows the summary and places the order then navigates to `/orders/:id`; step restored from the query param; out-of-stock rejection renders the named product.
- [ ] Write `pages/orders/` (newest-first history with `?status=` filter), `pages/order-detail/` (frozen `productName`/`unitPriceCents` line items and total), and `shared/status-badge.component.ts`.
- [ ] Write `pages/admin-products/` (list with `?q=` search and `?modal=delete&id=` confirm) and `pages/admin-product-form/` (reactive create/edit form for name, categoryId, description, priceCents, imageUrl, stockQty with validation errors).
- [ ] Write `pages/admin-orders/` — shopper email, status badge and total per row, `?status=` filter, and Mark shipped / Mark delivered actions with inline 400 handling for invalid transitions.
- [ ] Write `pages/admin-settings/` at `/admin/settings` — one section per provisioned service (`postgresql`, `minio`) with a configured/unconfigured badge and a per-service credential form posting to `PATCH /api/admin/settings`; masked values on load.

## service_agent tasks
- [ ] Write `web/src/app/core/models.ts` — TypeScript interfaces mirroring the entity contract (`User`, `Category`, `Product`, `Review`, `Cart`, `CartItem`, `Order`, `OrderItem`, `Paginated<T>`, `SystemSetting`) and the `Role` / `OrderStatus` unions.
- [ ] Write `web/src/app/core/api.service.ts` — thin typed `HttpClient` wrapper over the `/api` base with shared error normalization so components can render server messages inline.
- [ ] Write `web/src/app/app.config.ts` — `provideHttpClient(withInterceptors([authInterceptor]))` and `provideRouter(routes)`.
- [ ] Write `web/src/app/core/auth.service.ts` — `user` signal hydrated from `localStorage` then confirmed via `GET /api/auth/me`; `login()`, `signup()`, `logout()` (discards the token client-side).
- [ ] Write `web/src/app/core/auth.interceptor.ts` — attaches `Authorization: Bearer <token>`; on 401 clears auth state and routes to `/login`, never firing a redirect on `/`.
- [ ] Write `web/src/app/core/auth.guard.ts` (redirects unauthenticated users to `/login?redirect=<url>`) and `admin.guard.ts` (sends non-admins to `/`).
- [ ] Add catalog + review client methods — `getCategories()`, `getProducts({q, categoryId, page})`, `getProduct(id)`, `getReviews(productId)`, `createReview(productId, {rating, body})`.
- [ ] Write `web/src/app/core/cart.store.ts` — `getCart()`, `addItem()`, `updateItem()`, `removeItem()` against `/api/cart`, exposing a `count` signal for the header badge and re-fetching after each mutation.
- [ ] Add order + admin client methods — `createOrder({shipName, shipAddress})`, `getOrders(status?)`, `getOrder(id)`, admin product CRUD, `getAdminOrders(status?)`, `updateOrderStatus(id, status)`, `getSettings()`, `updateSettings(pairs)`.

## tester tasks
- [ ] Set up the e2e harness — Jest + Supertest config in `api/`, a migrated + seeded test database, and shared helpers for logging in as `admin@demo` and `shopper@demo` (`Demo1234!`).
- [ ] Write `api/test/auth.e2e-spec.ts` — seeded logins for both roles succeed; bad credentials ⇒ 401; duplicate signup ⇒ 409; signup always yields `role=shopper`; shopper `POST /api/admin/products` ⇒ **403**.
- [ ] Write `api/test/catalog.e2e-spec.ts` — `?q=headphones` matches "Wireless Headphones" and excludes non-matches; `?categoryId=<Books>` returns Books only; pagination is 12/page; `q` and `categoryId` compose; missing product ⇒ 404.
- [ ] Write `api/test/cart.e2e-spec.ts` — add qty 4 against stock 3 ⇒ **400** naming the product with existing qty unchanged; `qty < 1` ⇒ 400; repeated add sums qty on one line; cart contents survive a re-login.
- [ ] Write `api/test/orders.e2e-spec.ts` — checkout ⇒ order `placed`, cart emptied, `stockQty` decremented, prices frozen on `OrderItem`; empty cart ⇒ 400; stale-stock checkout ⇒ **400 naming the product**; order history scoped to owner and newest first; another user's order ⇒ 404.
- [ ] Write `api/test/reviews.e2e-spec.ts` — review without a delivered purchase ⇒ 403; ratings 0 and 6 ⇒ **400**; valid review recomputes `avgRating`/`reviewCount`; second review by the same user ⇒ **409** with the first review unchanged.
- [ ] Write `api/test/admin.e2e-spec.ts` — product create/patch as admin; `delivered→placed` and `placed→delivered` ⇒ **400** naming the attempted transition; `placed→shipped→delivered` succeeds; `GET /api/admin/orders?status=` filters and includes shopper email.
- [ ] Write a soft-delete regression spec — `DELETE /api/admin/products/:id` removes the product from catalog list, search and admin list, returns 404 on detail, yet the historical `OrderItem` still reports the frozen `productName` and `unitPriceCents`.
- [ ] Write a seed assertion spec — 12 products, 4 categories, exactly 2 out-of-stock, 3 reviews, 1 delivered order with a populated `OrderItem.productId`; run the seed twice to prove idempotency (no duplicates, no `avgRating` drift).
- [ ] Write an admin settings spec — `GET /api/admin/settings` returns masked values plus configured status for `postgresql` and `minio`; `PATCH` upserts and is reflected on re-read; shopper access ⇒ 403; `resolveConfig` prefers env over `SystemSetting` and ignores `PLACEHOLDER_CONFIGURE_IN_SETTINGS`.
- [ ] Write the smoke/manual checklist — `docker compose up`, load `/` and confirm the visible text "Storefront" plus the product grid render with no redirect; hard-refresh `/products/:id` and `/orders/:id` to confirm SPA fallback; confirm `/api/health` and `/api/health/deep` respond while static serving is active.

## Open questions
- **Role naming vs. the pipeline auth model.** The pipeline convention is `enum UserRole { ADMIN USER }`; the spec pins `enum Role { shopper admin }`. Tasks follow the spec's naming with `shopper` as the USER-equivalent role — confirm downstream tooling that keys on `UserRole`/`ADMIN` is tolerant, or agree on a rename before db_agent runs.
- **First-signup-becomes-admin.** The pipeline default promotes the first signup to ADMIN; the spec explicitly disables this because `admin@demo` is seeded. Confirm the seed always runs before any real signup in every deployment target (the entrypoint does run `db seed` before `node dist/main.js`).
- **Shared `/login` vs. `/admin/login`.** The spec deliberately omits a separate admin login route. Confirm no external check expects `/admin/login` to exist.
- **`minio` deployment is unreferenced by the spec.** `minio` is provisioned but no spec feature stores objects — product images are plain `imageUrl` strings. Settings tasks expose its credential keys, but nothing consumes them. Confirm whether product image upload to MinIO is in scope; if so it needs its own spec text before any agent implements it.
- **Settings credential key names.** The exact env var key names to surface for `postgresql` (e.g. `DATABASE_URL`) and `minio` (endpoint / access key / secret key / bucket) are not specified. backend_agent should derive them from the provisioned env and list them in `GET /api/admin/settings`.
- **`/admin/settings` is not in the spec's route table or `app.routes.ts` plan.** It is added per pipeline policy; confirm the nav entry and `data.flow: 'admin.settings'` value are acceptable additions.
- **Review body field.** The spec describes "1–5 stars + text" but never names the text column or states whether it is optional. Assumed `body String` and required; confirm before db_agent writes the schema.
- **Order status filter values.** `GET /api/orders?status=` is implied by the `orders.history` flow but is not in the API plan; assumed to accept the same `OrderStatus` values as the admin filter.
