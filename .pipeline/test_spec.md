# Test Specification

> **WARNING — `.pipeline/surface.json` is stale.** The file on disk is the generic pipeline
> scaffold (`GET /health`, `GET /trpc/users.findAll`, `GET /trpc/users.findById`, components
> `app-root`/`app-home`, test ids `home-*`/`users-*`). None of that surface exists in the approved
> spec, which defines a NestJS `/api`-prefixed REST surface and an Angular Storefront SPA.
> This test specification is therefore derived from the **spec** plus the authoritative surface
> contract in `.pipeline/tasks.md`. The one scaffold route that survives is `GET /health`, which
> maps forward to `GET /api/health`. The two `trpc/*` routes and all `home-*`/`users-*` test ids
> are treated as removed scaffold and are listed under **Out of scope**.
>
> Test-id note: `.colossus-acceptance.json` requires a `data-testid="app-ready"` element to exist
> once the SPA has bootstrapped, and rejects the scaffold signatures `home-title">Users<`,
> `Loading...` and `Failed to load users.`. Those two constraints are covered by `UI-SMOKE-01`
> and `UI-SMOKE-02`.

## Coverage summary
- Total cases: 335 (222 API · 93 UI/journey · 20 data-integrity)
- API endpoints covered: 24 / 24 in the spec surface contract (3 routes listed in the stale `surface.json`: 1 mapped forward, 2 obsolete)
- User journeys covered: 13
- Case-ID prefixes: `API-*` (per endpoint), `UI-*` (per journey), `DATA-*` (invariants)

Fixtures assumed by every case below (from `api/prisma/seed.ts`):
`admin@demo` / `Demo1234!` (role `admin`), `shopper@demo` / `Demo1234!` (role `shopper`);
categories Electronics, Home, Books, Sports; 12 products (3/category), exactly 2 with
`stockQty: 0`, one named `Wireless Headphones` in Electronics; 3 reviews; 1 `delivered` order for
`shopper@demo` whose `OrderItem.productId` points at a product that has **no** seeded review
(call it `P_REVIEWABLE`). `P_STOCK3` denotes any seeded product whose `stockQty` is set to 3 by
the test's own setup (via `PATCH /api/admin/products/:id`) when a bounded-stock fixture is needed.

## API tests

### `GET /api/health`
- **Happy path**: `API-HEALTH-01` — unauthenticated GET ⇒ `200` with body exactly `{"status":"ok"}`.
- **Validation failures**: `API-HEALTH-02` — `POST /api/health` ⇒ `404` (route is GET-only, and must not be swallowed by the SPA static handler).
- **Auth failures**: n/a — public liveness probe. `API-HEALTH-03` — sending a garbage `Authorization: Bearer notatoken` header still ⇒ `200` (no guard on the route).
- **Idempotency / edge cases**: `API-HEALTH-04` — 10 sequential calls all return `200` with identical bodies. `API-HEALTH-05` — response `content-type` is `application/json`, **not** `text/html` (regression guard against `ServeStaticModule` shadowing `/api*`).

### `GET /api/health/deep`
- **Happy path**: `API-HEALTHD-01` — with Postgres reachable ⇒ `200`, body includes `status: "ok"` and evidence the `SELECT 1` ran (e.g. `db: "ok"`).
- **Validation failures**: `API-HEALTHD-02` — `PATCH /api/health/deep` ⇒ `404`.
- **Auth failures**: n/a — public readiness probe; `API-HEALTHD-03` — no token required, anonymous call ⇒ `200`.
- **Idempotency / edge cases**: `API-HEALTHD-04` — with the DB unreachable (Prisma client stubbed/`$queryRaw` rejected) ⇒ `503`, body identifies the DB as the failing dependency; the process must stay alive (a follow-up `GET /api/health` still ⇒ `200`).

### `POST /api/auth/signup`
- **Happy path**: `API-SIGNUP-01` — `{email:"new-user-1@test.local", password:"Demo1234!"}` ⇒ `201` (or `200`) with `{accessToken, user:{id, email, role}}`; `role === "shopper"`; no `passwordHash` field anywhere in the body. `API-SIGNUP-02` — the returned token authenticates `GET /api/auth/me` and yields the same `id`/`email`.
- **Validation failures**: `API-SIGNUP-03` — missing `email` ⇒ `400`. `API-SIGNUP-04` — `email:"not-an-email"` ⇒ `400`. `API-SIGNUP-05` — missing `password` ⇒ `400`. `API-SIGNUP-06` — password shorter than the DTO minimum (e.g. `"x"`) ⇒ `400`. `API-SIGNUP-07` — body `{email, password, role:"admin"}` ⇒ either `400` (whitelist rejects unknown property) or `201` with `role === "shopper"`; under no circumstances is an admin created (verified by re-reading `GET /api/auth/me`). `API-SIGNUP-08` — extra unknown property `{nickname:"x"}` is stripped by `ValidationPipe({whitelist:true})` and never persisted.
- **Auth failures**: n/a — public route. `API-SIGNUP-09` — signing up while already holding a valid shopper token still ⇒ success and does not mutate the caller's account.
- **Idempotency / edge cases**: `API-SIGNUP-10` — signing up with `shopper@demo` (seeded) ⇒ `409`, and the seeded user's password still authenticates via `POST /api/auth/login`. `API-SIGNUP-11` — the same new email twice ⇒ first `201`, second `409`; exactly one `User` row exists. `API-SIGNUP-12` — the stored `passwordHash` is a bcrypt hash (starts `$2`), never the plaintext.

### `POST /api/auth/login`
- **Happy path**: `API-LOGIN-01` — `{email:"shopper@demo", password:"Demo1234!"}` ⇒ `200` with `{accessToken, user:{role:"shopper"}}`. `API-LOGIN-02` — `{email:"admin@demo", password:"Demo1234!"}` ⇒ `200` with `user.role === "admin"`. `API-LOGIN-03` — the decoded JWT carries `sub`, `email`, `role` claims and an `exp` ≈ 7 days out (`exp - iat` within ±60s of 604800).
- **Validation failures**: `API-LOGIN-04` — missing `password` ⇒ `400`. `API-LOGIN-05` — `email` not an email string ⇒ `400`. `API-LOGIN-06` — empty JSON body `{}` ⇒ `400`.
- **Auth failures**: `API-LOGIN-07` — correct email, wrong password (`"Wrong1234!"`) ⇒ `401`. `API-LOGIN-08` — unknown email `nobody@demo` ⇒ `401` (same status and message shape as `API-LOGIN-07`, so the response does not disclose account existence).
- **Idempotency / edge cases**: `API-LOGIN-09` — two consecutive logins as `shopper@demo` both succeed and both tokens authorize `GET /api/cart` against the *same* cart.

### `GET /api/auth/me`
- **Happy path**: `API-ME-01` — with a shopper token ⇒ `200` `{id, email:"shopper@demo", role:"shopper"}`, and no `passwordHash`. `API-ME-02` — with an admin token ⇒ `role:"admin"`.
- **Validation failures**: n/a (no request body/params).
- **Auth failures**: `API-ME-03` — no `Authorization` header ⇒ `401`. `API-ME-04` — `Bearer garbage` ⇒ `401`. `API-ME-05` — a token signed with the wrong secret ⇒ `401`. `API-ME-06` — an expired token (`exp` in the past) ⇒ `401`.
- **Idempotency / edge cases**: `API-ME-07` — repeated calls with the same token return byte-identical bodies.

### `GET /api/categories`
- **Happy path**: `API-CAT-01` — anonymous GET ⇒ `200` with an array of exactly 4 categories whose names are `Electronics`, `Home`, `Books`, `Sports`; each has `id` and `name`.
- **Validation failures**: n/a — no query params. `API-CAT-02` — an unknown query param (`?bogus=1`) is ignored and still ⇒ `200`.
- **Auth failures**: n/a — public. `API-CAT-03` — an admin token also ⇒ `200` with the same payload.
- **Idempotency / edge cases**: `API-CAT-04` — after `POST /api/admin/products` creates a product, the category count is still 4 (no implicit category creation).

### `GET /api/products`
- **Happy path**: `API-PROD-01` — anonymous `GET /api/products` ⇒ `200` `{items, total, page, pageSize}` with `total === 12`, `page === 1`, `pageSize === 12`, `items.length === 12`. `API-PROD-02` — every item exposes `id`, `name`, `priceCents` (integer), `imageUrl`, `stockQty`, `inStock` (boolean), `avgRating` (number), `reviewCount`, and a category name; no `deletedAt` leakage of soft-deleted rows. `API-PROD-03` — `inStock === (stockQty > 0)` for all 12 items, and exactly 2 items have `inStock === false`.
- **Search / filter / pagination**: `API-PROD-04` — `?q=headphones` ⇒ items include `Wireless Headphones` and exclude every product whose name lacks the substring (case-insensitive `contains` on `name`). `API-PROD-05` — `?q=HEADPHONES` returns the identical result set as `API-PROD-04` (case-insensitivity). `API-PROD-06` — `?q=zzzznomatch` ⇒ `200` with `items: []`, `total: 0` (not 404). `API-PROD-07` — `?categoryId=<Books.id>` ⇒ exactly 3 items, all with category name `Books`. `API-PROD-08` — `?q=<name-fragment-of-a-Books-product>&categoryId=<Books.id>` composes: result is the intersection, `total` reflects the filtered count. `API-PROD-09` — `?q=headphones&categoryId=<Books.id>` ⇒ `total: 0` (filters AND, not OR). `API-PROD-10` — `?pageSize=5&page=1` ⇒ 5 items, `total: 12`; `?pageSize=5&page=3` ⇒ 2 items; `?pageSize=5&page=4` ⇒ `items: []` with `total: 12`. `API-PROD-11` — omitting `pageSize` defaults to 12.
- **Validation failures**: `API-PROD-12` — `?page=0` ⇒ `400`. `API-PROD-13` — `?page=abc` ⇒ `400`. `API-PROD-14` — `?pageSize=-1` ⇒ `400`. `API-PROD-15` — `?categoryId=<nonexistent-uuid>` ⇒ `200` with `items: []` (not 404, not 500).
- **Auth failures**: n/a — public with optional JWT. `API-PROD-16` — an invalid `Authorization` header on this optional-JWT route does not 401 the request; the anonymous payload is returned.
- **Idempotency / edge cases**: `API-PROD-17` — after `DELETE /api/admin/products/:id`, that product is absent from the default list and `total` drops to 11. `API-PROD-18` — the soft-deleted product is also absent from `?q=<its name>` results.

### `GET /api/products/:id`
- **Happy path**: `API-PDET-01` — a seeded product id ⇒ `200` with `name`, `description`, `priceCents`, `imageUrl`, `stockQty`, `inStock`, `avgRating`, `reviewCount`, embedded `category:{id,name}`, and a `reviews` array. `API-PDET-02` — each review carries the reviewer's email, `rating`, `body`, `createdAt`. `API-PDET-03` — reviews are ordered newest-first (`createdAt` descending) — asserted on a product with ≥2 reviews created by the test.
- **Validation failures**: `API-PDET-04` — a well-formed but unknown id ⇒ `404`. `API-PDET-05` — a malformed id (`/api/products/%20`) ⇒ `400` or `404`, never `500`.
- **Auth failures**: n/a — public. `API-PDET-06` — an admin token returns the same public shape.
- **Idempotency / edge cases**: `API-PDET-07` — after soft delete, `GET /api/products/<deletedId>` ⇒ `404`. `API-PDET-08` — a product with zero reviews returns `avgRating: 0`, `reviewCount: 0`, `reviews: []`.

### `GET /api/products/:id/reviews`
- **Happy path**: `API-RLIST-01` — anonymous GET on a seeded product with reviews ⇒ `200` array; each entry has `id`, `rating` (1–5), `body`, `createdAt`, reviewer email.
- **Validation failures**: `API-RLIST-02` — unknown product id ⇒ `404` (or `200` with `[]` if the controller does not pre-check — the test asserts whichever the implementation documents, and that it is never `500`).
- **Auth failures**: n/a — public. `API-RLIST-03` — no token required; identical payload with and without a shopper token.
- **Idempotency / edge cases**: `API-RLIST-04` — ordering is newest-first and matches the `reviews` array embedded in `GET /api/products/:id`. `API-RLIST-05` — a soft-deleted product's reviews endpoint ⇒ `404`.

### `POST /api/products/:id/reviews`
- **Happy path**: `API-RPOST-01` — as `shopper@demo` on `P_REVIEWABLE` (present in the seeded `delivered` order, not yet reviewed) with `{rating:5, body:"Great"}` ⇒ `201`; response echoes the stored review. `API-RPOST-02` — after `API-RPOST-01`, `GET /api/products/P_REVIEWABLE` shows `reviewCount` incremented by 1 and `avgRating` equal to the arithmetic mean of all its ratings (recomputed, not drifted). `API-RPOST-03` — `rating:1` and `rating:5` are both accepted (inclusive bounds).
- **Validation failures**: `API-RPOST-04` — `rating: 0` ⇒ `400`. `API-RPOST-05` — `rating: 6` ⇒ `400`. `API-RPOST-06` — `rating: 3.5` (non-integer) ⇒ `400`. `API-RPOST-07` — `rating` missing ⇒ `400`. `API-RPOST-08` — `body` missing ⇒ `400`. `API-RPOST-09` — after any `400`, `reviewCount`/`avgRating` on the product are unchanged.
- **Auth failures**: `API-RPOST-10` — anonymous ⇒ `401`. `API-RPOST-11` — as a freshly signed-up shopper with no delivered order containing the product ⇒ `403`. `API-RPOST-12` — as `shopper@demo` on a product that is in **no** order of theirs ⇒ `403`. `API-RPOST-13` — a product bought but whose order is still `placed` (not `delivered`) ⇒ `403`.
- **Idempotency / edge cases**: `API-RPOST-14` — a second review by the same user on the same product ⇒ `409`, and `GET /api/products/:id/reviews` shows the **first** review with its original `rating`/`body` unchanged. `API-RPOST-15` — after the `409`, `reviewCount` did not increment. `API-RPOST-16` — a review on an unknown product id ⇒ `404`.

### `GET /api/cart`
- **Happy path**: `API-CGET-01` — as a shopper with no cart yet ⇒ `200` with an empty line array and `totalCents: 0` (cart is lazily created, never `404`). `API-CGET-02` — after adding 2 × a 1999-cent product ⇒ each line carries `id`, `productId`, product name, `qty`, `unitPriceCents`, `lineTotalCents === qty * unitPriceCents`, and cart `totalCents` equals the sum of `lineTotalCents`.
- **Validation failures**: n/a — no inputs.
- **Auth failures**: `API-CGET-03` — anonymous ⇒ `401`. `API-CGET-04` — expired token ⇒ `401`.
- **Idempotency / edge cases**: `API-CGET-05` — carts are per-user: shopper A's additions are invisible to shopper B. `API-CGET-06` — **persistence across re-login**: add an item, discard the token, log in again, `GET /api/cart` still returns the line (cart keyed on `userId`). `API-CGET-07` — repeated GETs do not create duplicate `Cart` rows for the user.

### `POST /api/cart/items`
- **Happy path**: `API-CADD-01` — `{productId:<in-stock>, qty:1}` ⇒ `200`/`201`; cart now has 1 line with `qty:1`. `API-CADD-02` — posting the same `productId` again with `qty:2` **sums** onto the existing line (`qty:3`) rather than creating a second line — cart has exactly one line for that product.
- **Validation failures**: `API-CADD-03` — `qty: 0` ⇒ `400`. `API-CADD-04` — `qty: -2` ⇒ `400`. `API-CADD-05` — `qty: "two"` ⇒ `400`. `API-CADD-06` — missing `productId` ⇒ `400`. `API-CADD-07` — `qty: 4` against `P_STOCK3` (stock 3) ⇒ `400` **whose message contains the product's name**; the cart line's qty is unchanged (or no line was created). `API-CADD-08` — incremental overflow: add `qty:2` then `qty:2` against stock 3 ⇒ second call `400` naming the product, and the line stays at `qty:2`. `API-CADD-09` — adding an out-of-stock product (`stockQty: 0`) with `qty:1` ⇒ `400` naming the product. `API-CADD-10` — unknown `productId` ⇒ `404` (or `400`), never `500`. `API-CADD-11` — a soft-deleted product ⇒ `404`/`400`, never silently added.
- **Auth failures**: `API-CADD-12` — anonymous ⇒ `401` and no cart row is created for anyone.
- **Idempotency / edge cases**: `API-CADD-13` — adding `qty` exactly equal to `stockQty` (3 against stock 3) ⇒ success (boundary is inclusive).

### `PATCH /api/cart/items/:id`
- **Happy path**: `API-CPATCH-01` — set an existing line to `{qty:2}` ⇒ `200`; `GET /api/cart` shows `qty:2` and a recomputed `lineTotalCents`/`totalCents`.
- **Validation failures**: `API-CPATCH-02` — `qty: 0` ⇒ `400`, line unchanged. `API-CPATCH-03` — `qty: -1` ⇒ `400`. `API-CPATCH-04` — `qty: 4` on a line for `P_STOCK3` ⇒ `400` naming the product, line unchanged at its previous qty. `API-CPATCH-05` — non-integer `qty` ⇒ `400`. `API-CPATCH-06` — unknown line id ⇒ `404`.
- **Auth failures**: `API-CPATCH-07` — anonymous ⇒ `401`. `API-CPATCH-08` — shopper B patching a line id belonging to shopper A ⇒ `403` or `404`, and A's line is unchanged (cross-tenant guard).
- **Idempotency / edge cases**: `API-CPATCH-09` — patching to the same qty twice is a no-op with a stable `totalCents`. `API-CPATCH-10` — `qty` exactly `stockQty` ⇒ success.

### `DELETE /api/cart/items/:id`
- **Happy path**: `API-CDEL-01` — deleting an existing line ⇒ `200`/`204`; `GET /api/cart` no longer lists it and `totalCents` drops by that line's `lineTotalCents`.
- **Validation failures**: `API-CDEL-02` — unknown line id ⇒ `404`.
- **Auth failures**: `API-CDEL-03` — anonymous ⇒ `401`. `API-CDEL-04` — shopper B deleting shopper A's line ⇒ `403`/`404`, and A's cart is unchanged.
- **Idempotency / edge cases**: `API-CDEL-05` — deleting the same line twice ⇒ second call `404`, cart still valid. `API-CDEL-06` — deleting the last line leaves an empty cart with `totalCents: 0` (the `Cart` row itself survives).

### `POST /api/orders`
- **Happy path**: `API-ORD-01` — with a cart holding 2 lines and `{shipName:"Ada L", shipAddress:"1 Test St"}` ⇒ `201` with `{id, status:"placed", totalCents, items[]}`; `totalCents` equals the pre-checkout cart total. `API-ORD-02` — each `OrderItem` **freezes** `productName` and `unitPriceCents` copied from the product at checkout time, and populates `productId`. `API-ORD-03` — after checkout, `GET /api/cart` is empty (`totalCents: 0`). `API-ORD-04` — each purchased product's `stockQty` decreased by exactly the ordered qty (verified via `GET /api/products/:id`).
- **Validation failures**: `API-ORD-05` — checkout with an empty cart ⇒ `400`. `API-ORD-06` — missing `shipName` ⇒ `400`. `API-ORD-07` — missing `shipAddress` ⇒ `400`. `API-ORD-08` — empty-string `shipName` ⇒ `400`. `API-ORD-09` — **stale stock**: shopper adds `qty:3` of `P_STOCK3`, then admin patches `stockQty` to 1, then checkout ⇒ `400` **naming that product**; the order is not created, the cart still holds its lines, and `stockQty` is still 1 (no partial decrement — whole `$transaction` rolled back).
- **Auth failures**: `API-ORD-10` — anonymous ⇒ `401`.
- **Idempotency / edge cases**: `API-ORD-11` — a second `POST /api/orders` immediately after a successful one ⇒ `400` (cart now empty); exactly one order exists. `API-ORD-12` — price freeze survives later edits: after checkout, admin patches the product's `priceCents`; `GET /api/orders/:id` still reports the original `unitPriceCents`. `API-ORD-13` — after a rejected checkout, no orphan `Order` or `OrderItem` rows exist for the user.

### `GET /api/orders`
- **Happy path**: `API-OLIST-01` — as `shopper@demo` ⇒ `200` array containing the seeded `delivered` order plus any created in the test, each with `id`, `status`, `totalCents`, `createdAt` and its `items[]`.
- **Ordering / filtering**: `API-OLIST-02` — orders are strictly newest-first by `createdAt`; after placing a new order it is element `[0]`. `API-OLIST-03` — `?status=delivered` returns only `delivered` orders; `?status=placed` returns only `placed` ones.
- **Validation failures**: `API-OLIST-04` — `?status=bogus` ⇒ `400` (or `200` with an empty list if the DTO treats it as a no-match — asserted against the implemented contract, never `500`).
- **Auth failures**: `API-OLIST-05` — anonymous ⇒ `401`. `API-OLIST-06` — **owner scoping**: shopper B's list never contains shopper A's orders, even when B is freshly registered (empty array).
- **Idempotency / edge cases**: `API-OLIST-07` — repeated calls return a stable ordering for orders sharing a `createdAt` second (deterministic tiebreak, no flapping).

### `GET /api/orders/:id`
- **Happy path**: `API-ODET-01` — the owner fetching their own order ⇒ `200` with frozen `productName`/`unitPriceCents` line items, `qty`, `totalCents`, `shipName`, `shipAddress`, `status`. `API-ODET-02` — an **admin** fetching *any* shopper's order ⇒ `200`.
- **Validation failures**: `API-ODET-03` — unknown order id ⇒ `404`.
- **Auth failures**: `API-ODET-04` — anonymous ⇒ `401`. `API-ODET-05` — shopper B fetching shopper A's order ⇒ `404` (not `403` — existence is not disclosed).
- **Idempotency / edge cases**: `API-ODET-06` — the sum of `unitPriceCents * qty` across items equals the order `totalCents`. `API-ODET-07` — after the product is soft-deleted, the order detail **still** renders the frozen `productName` and `unitPriceCents`.

### `POST /api/admin/products`
- **Happy path**: `API-APCRE-01` — as admin, `{name:"Test Widget", categoryId:<Home.id>, description:"d", priceCents:1234, imageUrl:"https://x/y.png", stockQty:7}` ⇒ `201` with the created product; it then appears in `GET /api/products` (`total` 12→13) and in `?q=widget`.
- **Validation failures**: `API-APCRE-02` — missing `name` ⇒ `400`. `API-APCRE-03` — `priceCents: -1` ⇒ `400`. `API-APCRE-04` — `priceCents: 12.34` (non-integer) ⇒ `400`. `API-APCRE-05` — `stockQty: -1` ⇒ `400`. `API-APCRE-06` — `categoryId` referencing no category ⇒ `400`/`404`, never `500`. `API-APCRE-07` — unknown extra field (`avgRating: 5`) is stripped by whitelist; created product has `avgRating: 0`, `reviewCount: 0`.
- **Auth failures**: `API-APCRE-08` — anonymous ⇒ `401`. `API-APCRE-09` — **as `shopper@demo` ⇒ `403`** and no product is created (`GET /api/products` total unchanged).
- **Idempotency / edge cases**: `API-APCRE-10` — creating with `stockQty: 0` yields `inStock: false` in the catalog listing.

### `PATCH /api/admin/products/:id`
- **Happy path**: `API-APUPD-01` — admin patches `{priceCents: 999}` ⇒ `200`; `GET /api/products/:id` reflects 999 and all other fields are unchanged. `API-APUPD-02` — a partial patch of only `stockQty` from 0 → 5 flips `inStock` to `true` in the catalog.
- **Validation failures**: `API-APUPD-03` — `priceCents: -5` ⇒ `400`, product unchanged. `API-APUPD-04` — `stockQty: "many"` ⇒ `400`. `API-APUPD-05` — unknown product id ⇒ `404`. `API-APUPD-06` — patching a soft-deleted product ⇒ `404`.
- **Auth failures**: `API-APUPD-07` — shopper token ⇒ `403`, product unchanged. `API-APUPD-08` — anonymous ⇒ `401`.
- **Idempotency / edge cases**: `API-APUPD-09` — applying the same patch twice leaves identical state. `API-APUPD-10` — patching `priceCents` does **not** retroactively change any existing `OrderItem.unitPriceCents`.

### `DELETE /api/admin/products/:id`
- **Happy path**: `API-APDEL-01` — admin deletes a product ⇒ `200`/`204`; the row still exists in the DB with a non-null `deletedAt` (soft delete).
- **Validation failures**: `API-APDEL-02` — unknown id ⇒ `404`. `API-APDEL-03` — deleting an already-deleted product ⇒ `404` (or idempotent `204` per the implemented contract) with `deletedAt` unchanged.
- **Auth failures**: `API-APDEL-04` — shopper ⇒ `403` and the product remains visible in the catalog. `API-APDEL-05` — anonymous ⇒ `401`.
- **Idempotency / edge cases (soft-delete regression bundle)**: `API-APDEL-06` — the deleted product is absent from `GET /api/products`. `API-APDEL-07` — absent from `GET /api/products?q=<its name>`. `API-APDEL-08` — absent from the admin product list. `API-APDEL-09` — `GET /api/products/:id` ⇒ `404`. `API-APDEL-10` — a historical `OrderItem` referencing it still returns the frozen `productName` and `unitPriceCents` on `GET /api/orders/:id`. `API-APDEL-11` — existing `Review` rows for the product are untouched (still counted in the DB).

### `GET /api/admin/orders`
- **Happy path**: `API-AOLIST-01` — as admin ⇒ `200` listing **every** order across all users, newest first, each row carrying the shopper's email alongside `status`, `totalCents`, `createdAt`. `API-AOLIST-02` — an order placed by a second shopper appears in the admin list but not in the first shopper's `GET /api/orders`.
- **Filtering**: `API-AOLIST-03` — `?status=placed` returns only `placed` orders; `?status=delivered` returns only `delivered` (the seeded one). `API-AOLIST-04` — no `status` param returns all orders (superset of every filtered result).
- **Validation failures**: `API-AOLIST-05` — `?status=cancelled` (not in the enum) ⇒ `400`.
- **Auth failures**: `API-AOLIST-06` — shopper ⇒ `403`. `API-AOLIST-07` — anonymous ⇒ `401`.
- **Idempotency / edge cases**: `API-AOLIST-08` — after `PATCH .../status`, the order's row in the filtered lists moves from `?status=placed` to `?status=shipped`.

### `PATCH /api/admin/orders/:id/status`
- **Happy path**: `API-AOST-01` — `placed → shipped` ⇒ `200`, order status is `shipped`. `API-AOST-02` — `shipped → delivered` ⇒ `200`. `API-AOST-03` — the full ladder `placed→shipped→delivered` in sequence succeeds, and the shopper sees the final status on `GET /api/orders/:id`.
- **Validation failures (transition rules)**: `API-AOST-04` — `placed → delivered` (skipping) ⇒ `400`, message names the attempted transition (contains both `placed` and `delivered`); status stays `placed`. `API-AOST-05` — `delivered → placed` (backwards) ⇒ `400` naming the transition; status stays `delivered`. `API-AOST-06` — `shipped → placed` ⇒ `400`. `API-AOST-07` — `delivered → shipped` ⇒ `400`. `API-AOST-08` — same-state `placed → placed` ⇒ `400`. `API-AOST-09` — `{status:"cancelled"}` (not in the enum) ⇒ `400`. `API-AOST-10` — missing `status` ⇒ `400`. `API-AOST-11` — unknown order id ⇒ `404`.
- **Auth failures**: `API-AOST-12` — shopper attempting to advance their **own** order ⇒ `403`, status unchanged. `API-AOST-13` — anonymous ⇒ `401`.
- **Idempotency / edge cases**: `API-AOST-14` — a rejected transition leaves `updatedAt`/status untouched and does not alter `stockQty` or any `OrderItem`.

### `GET /api/admin/settings`
- **Happy path**: `API-SGET-01` — as admin ⇒ `200` listing one entry per provisioned service credential key for `postgresql` and `minio`, each with `key`, a **masked** `value`, and a `configured` boolean. `API-SGET-02` — both service groups (`postgresql`, `minio`) are present.
- **Validation failures**: `API-SGET-03` — a set value is never returned in plaintext: the response for a key set to `supersecretvalue` contains neither `supersecretvalue` nor more than a short suffix/prefix of it. `API-SGET-04` — a key whose env value is the literal `PLACEHOLDER_CONFIGURE_IN_SETTINGS` and has no `SystemSetting` row reports `configured: false`.
- **Auth failures**: `API-SGET-05` — shopper ⇒ `403`. `API-SGET-06` — anonymous ⇒ `401`.
- **Idempotency / edge cases**: `API-SGET-07` — `resolveConfig(key)` prefers a real `process.env[key]` over the `SystemSetting` row; `API-SGET-08` — it falls back to `SystemSetting` when env is absent **or** equals `PLACEHOLDER_CONFIGURE_IN_SETTINGS`; `API-SGET-09` — it returns `null` when neither is set, and a consumer surfacing `ServiceUnconfiguredError` maps to HTTP `503`.

### `PATCH /api/admin/settings`
- **Happy path**: `API-SPATCH-01` — as admin, upsert `{MINIO_ACCESS_KEY:"abc123"}` ⇒ `200`; a follow-up `GET /api/admin/settings` shows that key `configured: true` with a masked value. `API-SPATCH-02` — patching multiple key/value pairs in one call persists all of them.
- **Validation failures**: `API-SPATCH-03` — empty body `{}` ⇒ `400` (or `200` no-op per the implemented contract — asserted, never `500`). `API-SPATCH-04` — a non-string value (`{K: 5}`) ⇒ `400`. `API-SPATCH-05` — a key outside the advertised credential key set is rejected (`400`) or ignored, never blindly written.
- **Auth failures**: `API-SPATCH-06` — shopper ⇒ `403` and no `SystemSetting` row is written. `API-SPATCH-07` — anonymous ⇒ `401`.
- **Idempotency / edge cases**: `API-SPATCH-08` — patching the same key twice **updates** the single row (upsert, no duplicates) and refreshes `updatedAt`. `API-SPATCH-09` — patching one key does not clear other previously-set keys.

## UI / journey tests

### Journey: Browse and search the catalog (guest)
- **Steps**: Load `/` as an anonymous visitor → read the header → type `headphones` into the header search box and submit → click the `Books` category in the nav → clear the search → click page 2 of the pagination.
- **Expected outcomes**: `UI-CAT-01` — `/` renders the catalog grid **directly with no redirect**; the URL stays `/` (no bounce to `/login`). `UI-CAT-02` — the literal text **"Storefront"** is visible in the header. `UI-CAT-03` — 12 product cards render; each shows name, category, a formatted price (e.g. `$19.99`, derived from `priceCents`), a star rating for `avgRating`, and an **"In stock"** or **"Out of stock"** label. `UI-CAT-04` — exactly 2 visible cards read "Out of stock". `UI-CAT-05` — searching sets `?q=headphones` in the URL and the grid narrows to matches including `Wireless Headphones`. `UI-CAT-06` — the category click sets `?category=<Books.id>`, the active category name is displayed on the page, and only Books products show. `UI-CAT-07` — pagination sets `?page=2` and the URL is restorable: reloading `/?q=headphones&category=<id>&page=2` reproduces the same filtered view. `UI-CAT-08` — a search with no matches renders an explicit empty state, not a blank page or a spinner.
- **Negative path**: `UI-CAT-09` — with `GET /api/products` stubbed to `500`, an inline error state renders and the header "Storefront" brand is still visible (the shell does not crash). `UI-CAT-10` — while the request is in flight a loading state renders and is replaced (never left stuck).

### Journey: View product detail and reviews (guest)
- **Steps**: From `/`, click a product card → read detail → switch to the reviews tab → attempt "Add to cart" while signed out → open an out-of-stock product.
- **Expected outcomes**: `UI-PD-01` — the URL becomes `/products/:id`; image, description, formatted price, stock label, average rating and the review list render. `UI-PD-02` — clicking the reviews tab sets `?tab=reviews`, and a hard reload of that URL restores the reviews tab. `UI-PD-03` — reviews display newest-first with the reviewer's email and star rating. `UI-PD-04` — signed out, "Add to cart" is hidden or disabled and the UI prompts sign-in (a link to `/login`). `UI-PD-05` — on an out-of-stock product, "Add to cart" is disabled and the "Out of stock" label shows. `UI-PD-06` — the quantity selector cannot exceed `stockQty`.
- **Negative path**: `UI-PD-07` — `/products/<unknown-id>` renders a not-found state (no infinite spinner, no unhandled error). `UI-PD-08` — a hard refresh of `/products/:id` still serves the SPA (static-fallback works, no 404 page from the server).

### Journey: Sign up
- **Steps**: `/` → header sign-up link → `/signup` → enter a new email + `Demo1234!` → submit.
- **Expected outcomes**: `UI-SU-01` — success redirects to the catalog and the header shows the signed-in state (Orders link visible, no Admin links). `UI-SU-02` — the new account has shopper privileges only: navigating to `/admin/products` redirects to `/`.
- **Negative path**: `UI-SU-03` — submitting `shopper@demo` renders an inline duplicate-email error (from the `409`), stays on `/signup`, and does not sign the user in. `UI-SU-04` — an invalid email or empty password shows inline validation and does not issue a network call.

### Journey: Log in (both roles) and guard redirects
- **Steps**: While signed out, navigate directly to `/cart` → observe the redirect → log in as `shopper@demo` → later log out and log in as `admin@demo`.
- **Expected outcomes**: `UI-LI-01` — `/cart` while signed out redirects to `/login?redirect=%2Fcart`. `UI-LI-02` — after a successful login the app navigates to the original `redirect` target (`/cart`), not to `/`. `UI-LI-03` — as `admin@demo` the header shows Admin Products / Admin Orders / Admin Settings links; as `shopper@demo` those links are absent. `UI-LI-04` — there is **no** `/admin/login` route; `/admin/login` falls through to the catalog wildcard. `UI-LI-05` — logout clears the token from `localStorage` and returns the header to the signed-out state; `/cart` then redirects to `/login` again. `UI-LI-06` — a shopper navigating to `/admin/orders` is redirected to `/`.
- **Negative path**: `UI-LI-07` — wrong password renders an inline error from the `401`, stays on `/login`, and stores no token. `UI-LI-08` — with a tampered/expired token in `localStorage`, the first authenticated request 401s and the app clears state and routes to `/login` — and this redirect never fires while sitting on `/`.

### Journey: Add to cart and manage the cart
- **Steps**: Signed in as `shopper@demo` → open an in-stock product → set qty 2 → "Add to cart" → open `/cart` → increment a line → remove a line → attempt to exceed stock.
- **Expected outcomes**: `UI-CART-01` — the header cart badge count updates after adding. `UI-CART-02` — `/cart` lists each line with product name, unit price, qty stepper, line total and a remove control, plus a cart total. `UI-CART-03` — incrementing refetches the cart and updates line total and cart total consistently. `UI-CART-04` — removing a line drops it from the list and reduces the total. `UI-CART-05` — an empty cart renders an explicit empty state with a link back to the catalog. `UI-CART-06` — cart contents survive logout + re-login (server-side, keyed on `userId`).
- **Negative path**: `UI-CART-07` — raising qty above `stockQty` renders the server's `400` inline **naming the product**, and the displayed qty reverts to its prior value. `UI-CART-08` — a `500` on a cart mutation shows an inline error without wiping the visible cart.

### Journey: Checkout
- **Steps**: From `/cart` click Checkout → `/checkout?step=shipping` → enter `shipName`/`shipAddress` → continue → `/checkout?step=review` → place the order.
- **Expected outcomes**: `UI-CO-01` — the URL carries `?step=shipping` then `?step=review`, and reloading `/checkout?step=review` restores the review step from the query param. `UI-CO-02` — the review step shows the line items and the order total matching `/cart`. `UI-CO-03` — placing the order navigates to `/orders/:id` and that page shows status `placed`. `UI-CO-04` — the header cart badge returns to 0 and `/cart` is empty. `UI-CO-05` — `/checkout` while signed out redirects to `/login?redirect=%2Fcheckout`.
- **Negative path**: `UI-CO-06` — submitting the shipping step with an empty `shipName` shows inline validation and does not advance. `UI-CO-07` — when the server rejects checkout for short stock, the **named product** from the `400` is rendered inline, the user stays on the checkout page, and the cart is preserved. `UI-CO-08` — an empty cart cannot reach the review step (or the place-order action surfaces the `400` inline).

### Journey: Order history and detail
- **Steps**: Signed in as `shopper@demo` → header Orders → `/orders` → filter by status → open an order.
- **Expected outcomes**: `UI-OH-01` — `/orders` lists the user's orders newest-first with a status badge, total and line items. `UI-OH-02` — the status filter sets `?status=delivered` and shows only delivered orders; the URL is restorable on reload. `UI-OH-03` — clicking an order opens `/orders/:id` showing the frozen `productName`/`unitPriceCents` line items, qty, total, and shipping name/address. `UI-OH-04` — a hard refresh of `/orders/:id` re-renders the same page (SPA deep-link fallback). `UI-OH-05` — a product soft-deleted after purchase still displays its frozen name and price in order detail.
- **Negative path**: `UI-OH-06` — a brand-new shopper sees an explicit "no orders yet" empty state. `UI-OH-07` — navigating to another user's `/orders/:id` renders a not-found state (server `404`), never another user's data. `UI-OH-08` — `/orders/:id` while signed out redirects to `/login?redirect=...`.

### Journey: Write a product review
- **Steps**: As `shopper@demo`, open `P_REVIEWABLE` (present in the seeded delivered order) → open `?modal=review` → pick 4 stars + text → submit → attempt a second review → open a non-purchased product.
- **Expected outcomes**: `UI-REV-01` — the review action is offered only when the API reports eligibility; `?modal=review` opens the star + text form. `UI-REV-02` — submitting shows the new review at the top of the list and updates the displayed average rating and review count without a manual reload. `UI-REV-03` — the modal state is URL-addressable: loading `/products/:id?modal=review` directly opens the form.
- **Negative path**: `UI-REV-04` — a second review by the same user surfaces the `409` inline and the original review text is still displayed unchanged. `UI-REV-05` — an out-of-range rating (if reachable) surfaces the `400` inline. `UI-REV-06` — on a product the user never received (`403`), the review form/CTA is not offered, and forcing `?modal=review` shows an ineligibility message rather than a broken form.

### Journey: Admin manages products
- **Steps**: As `admin@demo` → `/admin/products` → search → `/admin/products/new` → create → edit an existing product → open the delete confirm.
- **Expected outcomes**: `UI-AP-01` — `/admin/products` lists products with a `?q=` search bound to the URL. `UI-AP-02` — `/admin/products/new` renders a reactive form (name, categoryId, description, priceCents, imageUrl, stockQty); a valid submit creates the product and returns to the list where it is visible. `UI-AP-03` — `/admin/products/:id/edit` pre-populates the form with current values; saving persists and the list reflects the change. `UI-AP-04` — the delete control sets `?modal=delete&id=<id>` and renders a confirm dialog; confirming removes the product from both the admin list and the public catalog. `UI-AP-05` — cancelling the modal clears the query param and deletes nothing.
- **Negative path**: `UI-AP-06` — submitting the form with a negative or non-integer `priceCents` shows inline field validation and no network call (or surfaces the server `400` inline). `UI-AP-07` — a shopper navigating to `/admin/products` is redirected to `/`; an anonymous visitor is redirected to `/login?redirect=%2Fadmin%2Fproducts`.

### Journey: Admin advances order status
- **Steps**: As `admin@demo` → `/admin/orders` → filter `?status=placed` → Mark shipped → Mark delivered → attempt an invalid transition.
- **Expected outcomes**: `UI-AO-01` — each row shows the shopper's email, a status badge and the total, newest-first. `UI-AO-02` — the `?status=` filter is URL-bound and restorable on reload. `UI-AO-03` — Mark shipped moves the order to `shipped` in place, and the shopper's `/orders` view reflects it. `UI-AO-04` — Mark delivered then makes the order review-eligible for its shopper (ties into `UI-REV-01`).
- **Negative path**: `UI-AO-05` — a skipping/backwards transition (e.g. a stale tab clicking Mark delivered on a `placed` order) renders the server `400` inline **naming the attempted transition**, and the badge does not change. `UI-AO-06` — a shopper reaching `/admin/orders` is redirected to `/`.

### Journey: Admin configures service settings
- **Steps**: As `admin@demo` → header Admin Settings → `/admin/settings` → fill a credential field for `minio` → save → reload.
- **Expected outcomes**: `UI-AS-01` — one section renders per provisioned service (`postgresql`, `minio`), each with a configured/unconfigured badge. `UI-AS-02` — values load masked; the raw secret is never rendered in the DOM. `UI-AS-03` — saving issues `PATCH /api/admin/settings`, and after reload the affected key's badge reads configured with a masked value.
- **Negative path**: `UI-AS-04` — a server error on save renders inline and the previous values remain displayed. `UI-AS-05` — a shopper reaching `/admin/settings` is redirected to `/`.

### Journey: Shell, routing and deep-link smoke (container)
- **Steps**: `docker compose up` → load `/` → hard-refresh `/products/:id` and `/orders/:id` → request `/api/health` and `/api/health/deep` → request an unknown route `/totally/unknown`.
- **Expected outcomes**: `UI-SMOKE-01` — `/` shows the visible text **"Storefront"** and the product grid, with no client-side redirect firing; the acceptance ready marker (`data-testid="app-ready"`) is present once bootstrapped. `UI-SMOKE-02` — none of the rejected scaffold signatures appear anywhere in the rendered page: `home-title">Users<`, `Loading...` (as a terminal state), `Failed to load users.`. `UI-SMOKE-03` — hard-refreshing `/products/:id` and `/orders/:id` serves `index.html` and the SPA re-renders the correct page (deep links survive refresh). `UI-SMOKE-04` — `/api/health` and `/api/health/deep` return JSON, not `index.html`, while static serving is active (the `exclude: ['/api*']` guard). `UI-SMOKE-05` — `/totally/unknown` falls through the `**` wildcard to the catalog. `UI-SMOKE-06` — `<title>` is `Storefront`. `UI-SMOKE-07` — the container starts clean: entrypoint runs `prisma migrate deploy` → `prisma db seed` → `node dist/main.js`, and the app answers on port 3000.
- **Negative path**: `UI-SMOKE-08` — with Postgres stopped, `/api/health` still returns `200` while `/api/health/deep` returns `503` (liveness and readiness are genuinely distinct).

### Journey: Header and role-conditional navigation (cross-cutting)
- **Steps**: Visit `/`, `/products/:id`, `/cart`, `/orders`, `/admin/products` in each of the three states (anonymous, shopper, admin).
- **Expected outcomes**: `UI-NAV-01` — the literal text "Storefront" is visible in the header on **every** reachable page in every state. `UI-NAV-02` — the search box and category nav are present on every page. `UI-NAV-03` — signed out: Login/Sign up shown, Orders and Admin links hidden. `UI-NAV-04` — shopper: Orders and the cart badge shown, all Admin links hidden. `UI-NAV-05` — admin: Admin Products / Admin Orders / Admin Settings shown. `UI-NAV-06` — the cart badge reflects the server cart count after a reload (hydrated, not memory-only).
- **Negative path**: `UI-NAV-07` — a failing `GET /api/auth/me` on boot degrades to the signed-out header rather than blanking the page.

## Data integrity tests
- `DATA-01` — **Seed shape**: after `prisma db seed` on a fresh DB — exactly 4 categories, 12 products (3 per category), exactly 2 products with `stockQty: 0`, one product named `Wireless Headphones` in Electronics, users `admin@demo` (role `admin`) and `shopper@demo` (role `shopper`), 3 reviews, and 1 order with `status: 'delivered'` for `shopper@demo`.
- `DATA-02` — **Seed review-eligibility**: the seeded delivered order has at least one `OrderItem` with a non-null `productId` pointing at a product that has **no** seeded review (otherwise the review journey is untestable).
- `DATA-03` — **Seed idempotency**: running the seed twice yields identical counts (no duplicate categories/users/products/reviews/orders) and identical `avgRating`/`reviewCount` values — no drift.
- `DATA-04` — **Seeded denormalization is correct**: for every product, `reviewCount` equals `COUNT(Review)` and `avgRating` equals `AVG(rating)` (0 when there are no reviews), immediately after seeding.
- `DATA-05` — **Review write invariant**: after every accepted `POST /api/products/:id/reviews`, `reviewCount === COUNT(Review)` and `avgRating === AVG(rating)` for that product, recomputed inside the same transaction; after a rejected write (400/403/409) both are unchanged.
- `DATA-06` — **Review uniqueness**: `@@unique([productId, userId])` holds — no user has two `Review` rows for one product, even under two near-simultaneous POSTs (one succeeds, one `409`).
- `DATA-07` — **Cart uniqueness**: `Cart.userId` is unique (exactly one cart row per user after repeated `GET /api/cart` and mixed mutations), and `@@unique([cartId, productId])` holds — adding the same product twice sums onto one `CartItem` row.
- `DATA-08` — **Cart qty bounds**: no `CartItem` ever persists with `qty < 1` or `qty > product.stockQty` after any accepted or rejected mutation.
- `DATA-09` — **Checkout atomicity**: after a successful `POST /api/orders` — the `Order` exists with `status: 'placed'`, one `OrderItem` per former cart line, all of the user's `CartItem` rows are gone, and each product's `stockQty` decreased by exactly the ordered qty.
- `DATA-10` — **Checkout rollback**: after a `400` short-stock checkout, there are zero new `Order`/`OrderItem` rows, every `CartItem` is intact with its original qty, and **no** product's `stockQty` changed (partial decrements are a hard failure).
- `DATA-11` — **No overselling**: `stockQty` is never negative after any sequence of checkouts; two concurrent checkouts for the last unit result in exactly one success and one `400`.
- `DATA-12` — **Order total consistency**: for every `Order`, `totalCents === Σ(unitPriceCents × qty)` over its `OrderItem`s, and this still holds after later product price edits.
- `DATA-13` — **Price/name freeze**: `OrderItem.productName` and `unitPriceCents` are immutable snapshots — unaffected by `PATCH /api/admin/products/:id` and by soft delete.
- `DATA-14` — **Soft delete semantics**: `DELETE /api/admin/products/:id` sets `deletedAt` and deletes no row; associated `Review` and `OrderItem` rows survive; `OrderItem.productId` is either preserved or set null per the `onDelete: SetNull` relation without breaking order reads.
- `DATA-15` — **Role integrity**: no row created via `POST /api/auth/signup` ever has `role = 'admin'`, regardless of request body; the only admin is the seeded `admin@demo`.
- `DATA-16` — **Password storage**: `User.passwordHash` is always a bcrypt hash (cost 10 prefix `$2`), never plaintext, for both seeded and signed-up users.
- `DATA-17` — **Money is integer**: `priceCents`, `unitPriceCents`, `totalCents` and `lineTotalCents` are integers everywhere in the DB and in every API response (no floats, no rounding artefacts).
- `DATA-18` — **Order status monotonicity**: an `Order.status` only ever advances `placed → shipped → delivered`; no persisted row moves backwards or skips, even after rejected `PATCH` attempts.
- `DATA-19` — **`SystemSetting` upsert**: `PATCH /api/admin/settings` produces at most one row per `key` (`key` is the primary key), refreshes `updatedAt`, and never clears unrelated keys.
- `DATA-20` — **Migration cleanliness**: `prisma migrate deploy` applies from empty to head on a fresh Postgres 16 with no drift, and re-running it is a no-op.

## Out of scope
- **`GET /trpc/users.findAll` and `GET /trpc/users.findById`** — present in the stale `.pipeline/surface.json` scaffold but absent from the spec, which defines no tRPC layer and no `users` listing endpoint. Not tested; they are expected to be **removed** by the implementation.
- **Scaffold component surface** (`app-home`, test ids `home-main`, `home-title`, `users-loading`, `users-error`, `users-list`) — superseded by the Storefront pages. Only their *absence* is asserted, via `UI-SMOKE-02`.
- **Existing `backend/` and `frontend/` scaffold directories** — the spec builds into `api/` and `web/`. Their contents are not under test; only the final single-container artifact is.
- **MinIO object storage behaviour** — flagged as an open question in `tasks.md`. Product images are plain `imageUrl` strings; no upload/download path exists in the spec, so only the *settings surface* for MinIO credentials is tested (`API-SGET-*`, `API-SPATCH-*`, `UI-AS-*`), never object I/O.
- **Password reset, email verification, refresh tokens, and server-side token revocation** — the spec states logout merely discards the token client-side; no revocation endpoint exists to test.
- **Order cancellation / refunds / payment processing** — no payment step, no `cancelled` status in `OrderStatus`.
- **CORS behaviour** — the spec pins single-origin single-container serving and explicitly configures no CORS; there is nothing to assert.
- **Multi-tenancy, per-tenant isolation, and horizontal scale-out** — single-tenant app, K8s manifests pin 1 replica.
- **Rate limiting, brute-force lockout, CSRF tokens, and password-strength policy beyond DTO validation** — the spec is silent on all of them.
- **Accessibility (WCAG) audits, i18n/localization, and currency other than the implicit single currency** — the spec only requires cents-to-display formatting.
- **Visual regression / pixel diffs of Tailwind styling** — the spec constrains content ("Storefront", "In stock"/"Out of stock", star rating), not appearance.
- **Ingress TLS termination, DNS, and real cluster deployment** — `k8s/*.yaml` manifests are asserted only for probe paths and port 3000 by inspection, not by a live cluster apply.
- **Search relevance ranking, fuzzy matching, and search on `description`** — the spec pins a plain case-insensitive `contains` on `name` only.
