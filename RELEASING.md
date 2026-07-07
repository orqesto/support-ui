# Releasing

Ship a change: **your branch → staging (test) → production**. Three commands. Run them
in the repo you changed (`FE-app` or `BE-service`). The version you test on staging is
exactly what ships to prod.

## TL;DR
```
npm run ship:rc        # new version  → deploys to staging.odly.ai   (test here)
npm run ship:staging   # re-deploy staging, SAME version             (iterate on fixes)
npm run ship:prod      # release that exact version to production    (app.odly.ai)
```

## Step by step

1. **Build your feature**
   ```bash
   git checkout -b my-feature
   # ...code...
   git commit -am "feat: my thing"
   ```

2. **Cut a release candidate → staging**
   ```bash
   npm run ship:rc            # ship:rc:minor / ship:rc:major for bigger bumps
   ```
   Merges your branch into `staging`, bumps the version, deploys to **https://staging.odly.ai**.
   Wait ~3 min (FE) / ~12 min (BE) for CI.

3. **Test on staging** — https://staging.odly.ai.

4. **Found a bug? Fix and re-test (no version bump):**
   ```bash
   git commit -am "fix: tweak"
   npm run ship:staging
   ```
   Repeat 3–4 until it's good.

5. **Ship to production**
   ```bash
   npm run ship:prod          # asks y/N, then releases + verifies prod is serving it
   ```
   Merges `staging` → `main` and releases the version you tested to **https://app.odly.ai**.

## Cheat sheet
| Command | When | Bumps version? |
|---|---|---|
| `ship:rc` | start a new version on staging | ✅ once |
| `ship:staging` | iterate / fix that same version | ❌ no |
| `ship:prod` | release the tested version to prod | ❌ no |
| `ship:hotfix` | ⚠ urgent prod fix — **skips staging** | ✅ yes |

## Under the hood
- **Staging** auto-deploys on any push to the `staging` branch. The FE build is rsynced to
  `/var/www/frontend-staging` and served at `staging.odly.ai` (nginx same-origin proxies
  `/api` to the staging backend). The API URL is baked in at build time (`VITE_API_URL`).
- **Prod:** the **FE** deploys on push to `main` (no tag) → `/var/www/frontend` at
  `app.odly.ai`. The **BE** deploys on the `vX.Y.Z` tag `ship:prod` creates.
- `ship:prod` / `ship:hotfix` **block until prod actually serves the new build** (the FE
  check greps the deployed bundle for the release commit sha), so a failed deploy surfaces.
- Guards: won't run with uncommitted tracked changes; `--ff-only` pulls; confirm prompt
  before any prod release. The scripts live in `scripts/ship.sh` (+ `release-current.sh`).

## Notes
- **Coupled FE + BE change** (shared API contract): release **FE to prod before BE**.
- `npm run release:patch` still exists (bump + push `main` directly, no staging) — the
  `ship:*` flow is preferred; it routes through staging and self-verifies.
- Rollback, host details, and staging internals live in the BE-service docs:
  `../BE-service/DEPLOY.md` and `../BE-service/STAGING.md`.
