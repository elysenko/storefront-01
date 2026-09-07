# Architecture

## Stack requested
- `enterprise` (Angular 19 + NestJS + tRPC + Prisma + PostgreSQL)

## Scaffolding status
- `enterprise` — ✅ newly scaffolded from `template-enterprise` (project directory was empty except for `README.md`, `.git`, `.github`).

## Layout
- `frontend/` — Angular 19 standalone SPA (project name: `frontend`). Home route (`/`) calls the tRPC `users.findAll` procedure and renders results.
- `backend/` — NestJS 10 API with a `trpc` module (nestjs-trpc), a `users` router/service, a `health` module (`GET /health`, powered by `@nestjs/terminus`), and a `prisma` module/service.
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
