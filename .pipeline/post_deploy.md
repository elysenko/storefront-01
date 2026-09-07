# Post-Deploy Report — Storefront

**Deployed URL:** https://ubuntu.desmana-truck.ts.net/storefront-01/
**Run date:** 2026-09-07
**Overall status:** ❌ **FAILED — the deployment is not serving. Nothing is reachable at the published URL.**

---

## Phase 3 — Liveness check (headline result)

| Path | Status | Time | Served by |
|---|---|---|---|
| `/storefront-01/` | **404** | ~0.09 s | nginx |
| `/storefront-01/api/health` | **404** | ~0.09 s | nginx |
| `/storefront-01/api/health/deep` | **404** | ~0.09 s | nginx |
| `/storefront-01/index.html` | **404** | ~0.11 s | nginx |
| `/storefront-01/api/docs` (stack probe path) | **404** | ~0.10 s | nginx |

Re-probed **5 times over ~50 s** — 404 every time, so this is not a rollout still settling.

- **TLS: valid.** `CN=ubuntu.desmana-truck.ts.net`, Let's Encrypt, valid 2026-08-17 → **2026-11-15**. `ssl_verify_result=0`. TLS is not the problem.
- **The host is up and terminating correctly** — the 404 body is nginx's own error page, delivered in <100 ms. The edge is healthy; it simply has **no route/backend for `/storefront-01/`**.
- Alternate paths (`/`, `/healthz`, `/storefront/`, `/app/`) also 404 — consistent with a path-routed ingress with no default backend, and with the app's route being absent.

**Interpretation:** the ingress/nginx route for `/storefront-01/` was never created, or the backing Service/Deployment has no ready endpoints. Because a bare nginx 404 (not a 502/503) is returned, the most likely cause is a **missing ingress path mapping** rather than a crashed pod — a crashed-but-routed pod normally yields 502/503.

⚠️ The publisher stage reported this URL as live. It is not. **Treat the deploy as unsuccessful regardless of any upstream green status.**

---

## Phase 0 — Demo user seeding & credential reporting: **SKIPPED (blocked, and not applicable)**

Two independent reasons:

1. **kubectl is RBAC-forbidden for this identity.** As `system:serviceaccount:colossus:temporal-worker` against namespace `colossus-6ab247c3-e989-48bc-8-staging`:
   `get/list/create pods` → **no**, `create jobs` → **no**, `get secrets` → **no**, `list namespaces` → forbidden cluster-wide.
   The seed Job, the pod/image lookup, the exec fallback, and the CloudBeaver nodePort lookup are all impossible from here.
2. **The prescribed flow does not match this project's seed contract.** `backend/prisma/seed/seed.js` implements the **Colossus accounts-v1** contract: it *reads* `COLOSSUS_ACCOUNTS_JSON` (injected by the platform at provision) and upserts a `colossus_accounts` row plus a `User` per role. It **emits no `SEED_CRED` lines** — by design it "never prints emails, passwords or hashes", logging only `[seed] colossus_accounts upserted N (roles: ...)`.

**Consequence:** there are no credentials for this stage to harvest or report. Colossus **already holds** these logins — it minted them. No `PATCH /demo-credentials` call was made, because the only honest payload would be empty and I will not fabricate credentials. Roles defined by the contract: **ADMIN, MANAGER, USER**; login path `/login`.

Also note the seed runs in the deploy pipeline's migrate Job (`prisma migrate deploy && node prisma/seed/seed.js`), so it is upstream of this stage anyway. **Whether it actually ran could not be verified**, since the app is unreachable and DB access is denied.

---

## Phase 1 — Deferred secrets: **NONE FOUND (nothing pending)**

- `.pipeline/integrations.json` **does not exist**.
- No secrets store is reachable from this stage; no file matching a secrets DB was found under the workspace or `~`.
- Repo-wide grep for `obtain_timing`, `post_deploy`, `agent_command` → **no matches** outside the CI workflow noted below.

No secrets were resolved and **none are outstanding** — this project declares no deferred secrets. Runtime config is limited to `DATABASE_URL` / `JWT_SECRET`, injected from the existing K8s secret by the deploy stage.

---

## Phase 2 — Webhook registration: **NONE APPLICABLE**

- No `.pipeline/integrations.json`, so no integrations declare a webhook.
- The only `webhook` hits in the repo are in `.github/workflows/colossus-deploy.yml`: `COLOSSUS_WEBHOOK_SECRET` and a `POST` to `$COLOSSUS_API_URL/api/v1/webhooks/deploy/$COLOSSUS_DEPLOYMENT_ID`. That is Colossus's **own CI deploy-status callback**, fired by GitHub Actions using repo secrets — not a third-party integration, and not this stage's to register.

**No webhooks registered; none skipped for lack of credentials.**

---

## What a human still needs to do

1. **Fix the deployment — blocking.** Confirm whether the `/storefront-01/` ingress path exists and whether its Service has ready endpoints:
   `kubectl -n colossus-6ab247c3-e989-48bc-8-staging get ingress,svc,endpoints,pods`
   A bare nginx 404 points at a **missing ingress route** first; check the Service selector matches the Deployment's pod labels, and that `baseHref: "/{{IMAGE_NAME}}/"` in `colossus.yaml` was substituted to `/storefront-01/` at build time. A wrong/unsubstituted `baseHref` also breaks asset paths even once routing is fixed.
2. **Then re-verify** `/storefront-01/` and `/storefront-01/api/health`, and confirm the acceptance text — `"storefront"` and `"everything for the home, the trail and the shelf"` — plus the `app-ready` testid actually render.
3. **Grant kubectl rights** to the post-deploy identity (get pods, create jobs, get secrets in the team's staging namespace) if this stage is ever expected to seed or introspect the cluster. It currently cannot.
4. **Confirm the seed ran** once the app is reachable, by logging in with a platform-minted account at `/login`. If login fails, `COLOSSUS_ACCOUNTS_JSON` was likely not injected into the migrate Job — the seed exits 1 when it is missing.
5. **No credentials were posted to Colossus.** If the UI is expected to show demo logins, they must come from the platform's own accounts-v1 record, not from this stage.

---

## Files written
- `.pipeline/post_deploy.md` (this file)

**No application source code was modified.**
