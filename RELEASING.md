# Releasing

<!-- docs-status
verified-on: 2026-08-27
verified-against: FE main 2a09b7d
status: corrected
-->

> 📌 **`main` IS production here** — a push to it deploys `app.odly.ai` immediately, with no
> tag gate, unlike `BE-service`. So the branch a pull request targets decides whether it goes
> to users or to QA. See **[Where a PR goes](#where-a-pr-goes)** first.

Ship a change: **your branch → staging (test) → production**. Three commands. Run them
in the repo you changed (`FE-app` or `BE-service`). The version you test on staging is
exactly what ships to prod.

## TL;DR
```
npm run ship:rc        # new version  → deploys to staging.odly.ai   (test here)
npm run ship:staging   # re-deploy staging, SAME version             (iterate on fixes)
npm run ship:prod      # release that exact version to production    (app.odly.ai)
```

## Where a PR goes

**Base a pull request on `staging`, not `main`.** GitHub defaults the base to `main`, and on
this repo `main` is production — merging there puts the change in front of users with no QA
step. `staging` deploys `staging.odly.ai`, which runs the same build against the staging
backend.

This is convention, not enforcement: there is no branch protection on either branch, so the
only thing standing between a mis-targeted PR and a production deploy is the person opening
it. The PR template repeats the warning.

⚠️ `staging` is now the integration branch. It used to be a scratch slot for trying a branch
out on `staging.odly.ai`; pushing an experiment there now would clobber whatever release
candidate QA is looking at. Use the deploy workflow's `workflow_dispatch` with
`environment=staging` for that instead.

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
- **A push to `main` deploys BOTH sites** from that one commit, not production alone. That is
  deliberate (2026-08-19): when only the pushed branch deployed, every merge left
  `staging.odly.ai` serving older code than production — it drifted twice in a single day, and
  once a smoke test ran against a build that predated the feature under test.
- **Both environments live on one host.** They differ by `DEPLOY_PATH` and `NGINX_CONF` only;
  both rsync to `secrets.SSH_HOST` and both end in `nginx -t && systemctl reload nginx` there.
  That is why the workflow holds a single `deploy-frontend` concurrency group: `ship:prod`
  alone pushes `main` and then `staging` seconds apart, which is two runs against one box.
- **Prod:** the **FE** deploys on push to `main` (no tag) → `/var/www/frontend` at
  `app.odly.ai`. The **BE** deploys on the `vX.Y.Z` tag `ship:prod` creates.
- `ship:prod` / `ship:hotfix` **block until prod actually serves the new build** (the FE
  check greps the deployed bundle for the release commit sha), so a failed deploy surfaces.
- Guards: won't run with uncommitted tracked changes; `--ff-only` pulls; confirm prompt
  before any prod release. The scripts live in `scripts/ship.sh` (+ `release-current.sh`).

## Notes
- **Coupled FE + BE change: the order depends on the direction of the change.** The blanket
  "FE before BE" this file used to give is right for only one of the two cases.
  - **BE adds a field the FE reads → release BE first.** The FE deploys on a `main` push while
    the BE waits for a tag, so an FE shipped first reads `field.value` on a response that has
    no `field` — a white screen, not a blank value.
  - **BE changes the shape of a field the FE already reads → release FE first**, so the new
    bundle is in place before the old one meets the new shape. That is why FE #222 had to
    merge before BE #485 was released.
  - Either way, normalise new fields defensively so the FE tolerates both shapes; the skew
    window is real and nothing enforces the order. Each PR template asks which half goes
    first, because the answer is known when the PR is written and forgotten by the time it
    is merged.
- `npm run release:patch` still exists (bump + push `main` directly, no staging) — the
  `ship:*` flow is preferred; it routes through staging and self-verifies.
- Rollback, host details, and staging internals live in the BE-service docs:
  `../BE-service/DEPLOY.md` and `../BE-service/STAGING.md`.
