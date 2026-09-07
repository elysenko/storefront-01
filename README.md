# Storefront

An Amazon-shaped storefront: catalog browse/search, product detail with reviews and
star ratings, a persistent server-side cart, checkout with transactional stock
decrement, order tracking (`placed → shipped → delivered`) and an admin console for
products, orders and service settings.

- `frontend/` — Angular 19 standalone SPA (nginx, proxies `/api/` to the API).
- `backend/` — NestJS + Prisma REST API under the global `/api` prefix.

## Local development

Full stack in containers (builds both images, runs migrations, serves the SPA on
nginx proxying `/api/` to the API):

```bash
docker compose up --build              # postgres :5432, backend :3000, frontend :8080
```

Or for hot-reload development, run Postgres in a container and the two apps natively:

```bash
docker compose up -d postgres          # Postgres 16 on :5432

cd backend
cp .env.example .env                   # then edit DATABASE_URL / JWT_SECRET
npm install
npx prisma migrate deploy
npm run start:dev                      # http://localhost:3000/api  (also :3001)

cd ../frontend
npm install
npx ng serve                           # http://localhost:4200, proxies /api
```

Swagger UI: `http://localhost:3000/api/docs`.

## Environment

| Variable          | Required | Notes                                                          |
| ----------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`    | yes      | Postgres connection string; provisioned by the platform.         |
| `JWT_SECRET`      | yes      | HS256 signing secret; provisioned by the platform.               |
| `JWT_EXPIRES_IN`  | no       | Token lifetime, default `7d`.                                    |
| `PORT`            | no       | Primary listen port, default `3000`.                             |
| `ALT_PORT`        | no       | Secondary listen port, default `3001` (matches `colossus.yaml`). |
| `MINIO_*`         | no       | Optional object-storage credentials, editable in Admin → Settings. |

Third-party credentials are always optional: a missing key degrades that feature
(503 at call time via `ServiceUnconfiguredError`) instead of failing startup.

## Accounts

Platform logins come from `prisma/seed/seed.js`, which materializes one
`colossus_accounts` row and one `User` per `COLOSSUS_ACCOUNTS_JSON` entry (bcryptjs
hash in `User.passwordHash`), verified by the auth service with `bcrypt.compare`.
Signup always creates a shopper — the role is never client-settable. Roles map as
`ADMIN → admin`, everything else → `shopper`.

The same seed script also runs a demo-data stage, gated by `SEED_DEMO_DATA`
(defaults on; set to `false` to disable) — the Dockerfile sets it explicitly since
the OpenSpec "Seed data" scenario requires it on every deploy of this app. It seeds
two fixed logins, `admin@demo` and `shopper@demo` (password `Demo1234!`), plus the
4-category / 12-product catalog (2 out of stock, one "Wireless Headphones"), 3
reviews, and 1 delivered order for `shopper@demo`. All writes are upserts or
existence-guarded, so re-running the seed never duplicates a row.

## API

All routes sit under `/api`. See `.pipeline/surface.json` or `/api/docs` for the full
list.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | public | liveness `{status:'ok'}` |
| GET | `/api/health/deep` | public | readiness; `SELECT 1`, 503 when the DB is down |
| POST | `/api/auth/signup` | public | 409 on duplicate email; always `role=shopper` |
| POST | `/api/auth/login` | public | 401 on bad credentials |
| GET | `/api/auth/me` | jwt | current user |
| GET | `/api/categories` | public | |
| GET | `/api/products` | public | `?q=&categoryId=&page=&pageSize=` (12/page) |
| GET | `/api/products/:id` | public | 404 when missing or soft-deleted |
| GET | `/api/products/:id/reviews` | public | newest first, with reviewer email |
| GET | `/api/products/:id/reviews/eligibility` | optional | drives the review form |
| POST | `/api/products/:id/reviews` | jwt | 400 rating outside 1–5, 403 not delivered, 409 duplicate |
| GET/POST | `/api/cart`, `/api/cart/items` | jwt | 400 over stock, naming the product |
| PATCH/DELETE | `/api/cart/items/:id` | jwt | |
| POST | `/api/orders` | jwt | transactional checkout; 400 empty cart / short stock |
| GET | `/api/orders`, `/api/orders/:id` | jwt | own orders (admins may read any) |
| GET/POST/PATCH/DELETE | `/api/admin/products` | admin | delete is soft (`deletedAt`) |
| GET/POST | `/api/admin/categories` | admin | bootstrap the empty catalog |
| GET | `/api/admin/orders` | admin | `?status=`, joined shopper email |
| PATCH | `/api/admin/orders/:id/status` | admin | only `placed→shipped→delivered` |
| GET/PATCH | `/api/admin/settings` | admin | masked service credentials |

The catalog is populated by the seed's demo-data stage (see Accounts above). If it
has been disabled (`SEED_DEMO_DATA=false`), an admin can create categories and
products from the admin console instead (or `POST /api/admin/categories` then
`POST /api/admin/products`).

## Commands

```bash
cd backend
npm run build          # nest build → dist/main.js
npm run typecheck      # tsc --noEmit
npm test               # jest
npx prisma migrate deploy
```
