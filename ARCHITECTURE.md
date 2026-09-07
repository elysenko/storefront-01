# Architecture

## Stack requested
- `enterprise` (Angular 19 + NestJS + tRPC + Prisma + PostgreSQL)

## Scaffolding status
- `enterprise` — ✅ newly scaffolded from `template-enterprise` (project directory was empty except for `README.md`, `.git`, `.github`).

## Layout
- `frontend/` — Angular 19 standalone SPA (project name: `frontend`). Home route (`/`) calls the tRPC `users.findAll` procedure and renders results.
- `backend/` — NestJS REST API under the global `/api` prefix: `auth` (JWT + passport, `RolesGuard`), `catalog`, `reviews`, `cart`, `orders`, `admin` (products / categories / orders / settings), `health` (`/api/health`, `/api/health/deep`) and `prisma`. Swagger at `/api/docs`. The template's `trpc` and `users` modules were removed — the SPA talks plain HTTP to `/api`, so `nestjs-trpc` (which parses TypeScript sources at boot, absent from the runtime image) was dead weight and a startup risk.
- `.pipeline/surface.json` — machine-readable manifest of routes, components, and `data-testid`s for the test_spec/Playwright pipeline.
- `.colossus-acceptance.json` — acceptance contract read by the post-deploy render gate.
- `colossus.yaml` — build/deploy manifest read by deploy agents (Angular frontend + NestJS backend, both served from the same container image per the template's Dockerfile).
- `docker-compose.yml` — local Postgres + app for local dev.

## Plan context
The technical plan attached to this run (`Storefront` — an Amazon-shaped e-commerce app) describes a bespoke NestJS + Prisma + Angular structure (auth, catalog, cart, orders, admin, etc.) that diverges from the template's default `users`-only scaffold. Per the stack contract, the platform's `enterprise` template stack is authoritative for project structure; the plan's *features* (auth, catalog, reviews, cart, checkout, orders, admin) should be implemented on top of this scaffolded structure by the coder agent(s), extending `backend/src/*` modules and `frontend/src/app/*` pages rather than introducing a different framework or a second root-level `api/`/`web/` layout.

## Next steps for the developer / coder agent
1. Copy env templates if/when added (`backend/.env.template` → `backend/.env`) — none were present in the template at scaffold time.
2. `cd backend && npm install && npx prisma generate` before running migrations.
3. Extend `backend/prisma/schema.prisma` with the Storefront data model (Product, Category, Cart, Order, Review, etc.) described in the plan, then run `npx prisma migrate dev`.
4. Build out `backend/src/{auth,catalog,reviews,cart,orders,admin}` modules and `frontend/src/app/{pages,core,layout,shared}` per the plan, updating `.pipeline/surface.json` with every new route/component/`data-testid` as they're added.
5. `docker compose up` for local Postgres + app once env vars are set.
6. Update `.colossus-acceptance.json` `expect_text` once the real storefront front page (brand "Storefront", product grid) replaces the template's default Users list.

## Template sources
- `template_dir = /app/scaffold-templates`
- `template-enterprise/` copied directly into the project root (`frontend/` + `backend/` merged in, not nested under a subdirectory).

## Backend pass notes (coder agent)

- **Roles.** Prisma keeps the platform contract's `Role { USER MANAGER ADMIN }`; the API
  and JWT speak the spec's vocabulary (`ADMIN → admin`, everything else → `shopper`).
- **Ports.** `colossus.yaml` declares the backend on 3001 while `frontend/nginx.conf`
  proxies to `backend:3000`. `src/main.ts` serves the same Express handler on both
  (`PORT`, `ALT_PORT`) so neither assumption can break the deploy.
- **No seeded business data.** `prisma/seed/seed.js` stays essential-only (platform
  logins). The catalog therefore starts empty; `POST /api/admin/categories` and
  `POST /api/admin/products` (which also accepts `categoryName`) let an admin bootstrap it.
- **Build determinism.** `incremental` was removed from `tsconfig.json` and
  `*.tsbuildinfo` is ignored: a stale build-info file made `nest build` exit 0 while
  emitting nothing, which surfaces only as `Cannot find module dist/main.js` at runtime.

## Service pass notes (frontend wiring)

- **Transport.** The SPA talks plain HTTP to the same-origin REST API under `/api`
  (`frontend/src/app/core/api.service.ts`). `nginx.conf` proxies it in the container and
  `proxy.conf.json` does the same for `ng serve`, so no base URL is baked into the bundle.
  The dead `TRPC_CLIENT` provider and `trpc-client.types.ts` were removed — nothing consumed them.
- **Auth.** `core/session.ts` holds the JWT and the current user in plain module state rather
  than a service. `AuthService -> HttpClient -> authInterceptor -> AuthService` would otherwise
  be a construction cycle. The interceptor attaches the bearer token and clears the session on a
  401, but never redirects from `/`, `/products/*`, `/login` or `/signup` — the root URL has to
  keep painting the brand and the grid for a signed-out visitor.
- **Stores are read-through, not optimistic.** `CatalogStore` pulls the live catalog once and
  resolves browse/search/paging against that snapshot; every mutation re-reads the row the API
  returns instead of patching locally. `CartStore` replaces its lines with the `CartView` from each
  cart call, so stock caps and line totals stay server-decided. `OrdersStore` holds whichever
  slice the current screen asked for (`/api/orders` vs `/api/admin/orders`).
- **No mock data.** `core/mock-data.ts` and every `COLOSSUS_PREVIEW` branch that depended on it
  were deleted — there is no demo fallback path left in the app.
- **Review eligibility** is `GET /api/products/:id/reviews/eligibility`, never re-derived in the
  browser; `CatalogStore.canReview()` just reads the cached server answer.
- **Category bootstrap.** Categories are reference data and ship with no fixtures, so the product
  form would open an empty, unusable dropdown on a fresh deployment. `CatalogStore.ensureCategories()`
  posts the four spec categories to `POST /api/admin/categories` (idempotent on name) when an admin
  opens the form. Business rows are still never seeded.
