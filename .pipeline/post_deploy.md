# Post-Deploy Report — Storefront

**Deployed URL:** https://storefront-01-staging-5d1f3dea031e87e1.olympus-ai.cloud/
**Run date:** 2026-09-07
**Overall status:** ✅ **LIVE AND HEALTHY** — app, API and database all responding.

> ⚠️ **This report supersedes the previous version of this file.** The earlier run probed
> `https://ubuntu.desmana-truck.ts.net/storefront-01/` — a *different host* — and concluded the
> deploy had failed. That URL is not the deployment URL for this run. Against the correct URL
> everything returns 200. **Disregard the prior "FAILED" verdict.**

---

## Phase 3 — Liveness check ✅

| Path | Status | Time | Body |
|---|---|---|---|
| `/` | **200** | 0.24 s | SPA shell, `<title>Storefront</title>` |
| `/api/health` | **200** | 0.19 s | `{"status":"ok"}` |
| `/api/health/deep` | **200** | 0.18 s | `{"status":"ok","database":"ok"}` |

Re-probed `/api/health` **5×**: 200 every time, 0.147–0.187 s. Stable, not a settling rollout.

**TLS: valid.** `CN=olympus-ai.cloud`, issuer Google Trust Services WE1, valid **2026-09-03 → 2026-12-02**. `ssl_verify_result=0`.

**Deeper verification (all pass):**
- **DB connectivity confirmed** — `/api/health/deep` runs `SELECT 1` and reports `database:"ok"`, so migrations applied and Prisma is connected.
- **API/static split correct** — the `ServeStaticModule` `exclude` risk flagged in the plan did **not** materialise; `/api/*` returns JSON, not `index.html`.
- **SPA deep-link fallback works** — `/cart`, `/orders`, `/admin/products`, `/products/<bogus>` all return 200 HTML.
- **Auth guards live** — `/api/cart`, `/api/orders`, `/api/admin/products` each return **401** unauthenticated. Bad-credential login returns a clean **401** (`"Email address or password is incorrect."`), proving the auth path and `User` table are functional.
- **Acceptance contract satisfied in the served bundle** — the `app-ready` testid and both `expect_text` strings are present in the deployed JS (`main-BFMNDHLG.js`, `chunk-24XJF2EH.js`): the brand **"Storefront"** and **"Everything for the home, the trail and the shelf"**. No `reject_signatures` matched.

---

## ⚠️ Catalog is empty — expected, but worth a human decision

`GET /api/products` → `{"items":[],"total":0,"page":1,"pageSize":12}` and `GET /api/categories` → `[]`.

This is **not a fault** — it is the shipped seed contract. `backend/prisma/seed/seed.js` is explicitly
essential-only and its header forbids sample rows ("shipped seeds carry no sample data; screens render
their empty state on first load"; the build gate flags `unguarded-seed-fixture`). The technical plan's
Step 10 (12 products / 4 categories / reviews / a delivered order) was therefore **intentionally dropped**
by the gate at commit `60a5613`.

**Consequence:** the storefront renders its empty state. Browse, search, cart, checkout, reviews and the
admin console are all deployed and reachable, but there is nothing to buy until an admin creates products
via `POST /api/admin/products`. If a populated demo is expected, that is a product decision, not a deploy bug.

---

## Phase 0 — Demo user seeding & credential reporting: **NOT PERFORMED** (two blockers)

1. **kubectl is RBAC-forbidden for this identity.** As `system:serviceaccount:colossus:temporal-worker`
   against `colossus-6ab247c3-e989-48bc-8-staging`, `kubectl auth can-i` returns **no** for
   `get pods`, `create jobs`, `get secrets` and `get services`. The seed Job, the pod/image lookup, the
   `kubectl exec` fallback and the CloudBeaver nodePort lookup are all impossible from here.
2. **The prescribed flow does not match this project's seed contract.** The seed implements
   **Colossus accounts-v1**: it *reads* `COLOSSUS_ACCOUNTS_JSON` (platform-injected at provision) and upserts
   a `colossus_accounts` row plus a `User` per role, hashing with bcrypt. It emits **no `SEED_CRED` lines** —
   by design it logs only `[seed] colossus_accounts upserted N (roles: ...)` and never prints emails or passwords.

**No `PATCH /demo-credentials` call was made.** There are no credentials for this stage to harvest, and the
only honest payload would be empty — I did not fabricate any. Colossus **already holds** these logins because
it minted them. The Colossus API *is* reachable from here (the endpoint responds; `GET` 404s because only
`PATCH` is routed), so this was a data problem, not a connectivity one.

Seeding also runs **upstream** of this stage, inside the deploy pipeline's migrate Job
(`prisma migrate deploy && node prisma/seed/seed.js`). Its success could not be directly confirmed — DB access
is denied — but the evidence is consistent with it having run: `/api/health/deep` reports the database healthy
and the login endpoint queries `User` without error. Login path is `/login`.

**CloudBeaver:** not detectable (`get services` forbidden). No CloudBeaver credentials added.

---

## Phase 1 — Deferred secrets: **NONE** ✅

- `.pipeline/integrations.json` **does not exist**.
- `colossus.manifest.json` declares `"env": {"required": []}` — the app needs no additional runtime config.
- Repo-wide grep for `obtain_timing`, `post_deploy`, `agent_command`, `obtain_by` → **no matches** outside this report.
- No secrets-store file found under the workspace or `~`.

Nothing resolved because nothing was pending. Runtime config is limited to `DATABASE_URL` / `JWT_SECRET`,
injected from the existing K8s secret by the deploy stage. **No secrets are outstanding.**

---

## Phase 2 — Webhook registration: **NONE APPLICABLE** ✅

- No `.pipeline/integrations.json`, so no integration declares a webhook.
- The only `webhook` references in the repo are in `.github/workflows/colossus-deploy.yml`
  (`COLOSSUS_WEBHOOK_SECRET`, `POST $COLOSSUS_API_URL/api/v1/webhooks/deploy/$COLOSSUS_DEPLOYMENT_ID`).
  That is Colossus's own CI deploy-status callback, fired by GitHub Actions from repo secrets — not a
  third-party integration and not this stage's to register.

**0 registered, 0 skipped for missing credentials, 0 failed.**

---

## What a human still needs to do

1. **Nothing is blocking.** The deployment is live, healthy and serving the acceptance contract.
2. **Decide on catalog content.** The storefront is empty by design (see above). To demo the shopping flow,
   sign in as the platform ADMIN account at `/login` and create categories/products through the admin console.
3. **Retrieve demo logins from Colossus, not from here.** The accounts-v1 record the platform minted is the
   source of truth; this stage cannot read or re-post it.
4. **Optional — grant kubectl rights** (`get pods`, `create jobs`, `get secrets` in the team staging namespace)
   if the post-deploy stage is ever expected to seed or introspect the cluster. It currently cannot.

---

## Files written
- `.pipeline/post_deploy.md` (this file)

**No application source code was modified.**
