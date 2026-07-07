#!/usr/bin/env bash
#
# Unified deploy helper — release-candidate flow.
#
#   ship.sh staging            push current work to staging (QA) — NO version bump
#   ship.sh rc     [level]     cut a release candidate: bump version, deploy to staging
#   ship.sh prod               release the CURRENT (RC) version to prod — NO bump
#   ship.sh hotfix [level]     bump + release straight from main, merge back to staging
#
# level = patch (default) | minor | major
#
# Version lifecycle (RC model): `ship:rc` bumps the version ONCE and deploys it to
# staging.odly.ai. Iterate with `ship:staging` (re-test the SAME version, no bump). When
# QA passes, `ship:prod` merges staging→main and ships that EXACT version to prod
# (FE: push main · BE: tag vX.Y.Z → :X.Y.Z + :latest). So what you test on staging is
# what you release. Prod deploy per repo differs; both go through ./scripts/release-*.sh.
#
# prod/hotfix BLOCK on verify_prod() until app.odly.ai actually serves the new build.
#
set -euo pipefail

# Re-exec from a stable /tmp copy so a `git checkout` mid-run can never pull this script
# file out from under the running shell (it may not exist on every branch yet).
if [ -z "${SHIP_REEXEC:-}" ]; then
  _tmp="$(mktemp)"; cp "$0" "$_tmp"
  SHIP_REEXEC=1 exec bash "$_tmp" "$@"
fi

cd "$(git rev-parse --show-toplevel)"

TARGET="${1:-}"
LEVEL="${2:-patch}"
PROD_URL="https://app.odly.ai"

die(){ echo "❌ $*" >&2; exit 1; }
# Only block on uncommitted changes to *tracked* files; untracked files (e.g. local
# .planning/ notes) are intentionally not committed and are fine.
require_clean(){ [ -z "$(git status --porcelain --untracked-files=no)" ] || die "Uncommitted changes to tracked files — commit or stash first."; }
confirm(){ read -r -p "$1 [y/N] " a; [ "$a" = "y" ] || [ "$a" = "Y" ] || die "Aborted."; }

# Poll production until it serves the just-released build, or time out (~25 min).
#   $1 = released version (package.json)   $2 = released commit sha
verify_prod(){
  local ver="$1" sha="$2" short="${2:0:7}" is_be=0 i=0 max=75 st=""
  grep -qE '"name":[[:space:]]*"[^"]*request-service"' package.json && is_be=1
  echo "⏳ Verifying production serves v$ver ($short) — CI build+deploy can take ~3–15 min…"
  while [ "$i" -lt "$max" ]; do
    i=$((i+1))
    if [ "$is_be" = 1 ]; then
      local got
      got="$(curl -s --max-time 10 "$PROD_URL/api/health/version" 2>/dev/null \
             | grep -oE '"version":"[^"]+"' | head -1 | sed -E 's/"version":"//; s/"$//')"
      [ "$got" = "$ver" ] && { echo "✅ Production API serving v$ver — $PROD_URL/api/health/version"; return 0; }
      st="currently v${got:-?}"
    else
      local idx asset
      idx="$(curl -s --max-time 10 "$PROD_URL/" 2>/dev/null || true)"
      asset="$(printf '%s' "$idx" | grep -oE '/assets/[^"]+\.js' | head -1)"
      if [ -n "$asset" ] && curl -s --max-time 12 "$PROD_URL$asset" 2>/dev/null | grep -q "$sha"; then
        echo "✅ Production bundle live ($short) — $PROD_URL"; return 0
      fi
      st="bundle not yet $short"
    fi
    printf '   … %s/%s (%s)\n' "$i" "$max" "$st"
    sleep 20
  done
  echo "⚠ Could NOT confirm prod serves v$ver ($short) after ~25 min — the deploy may have"
  echo "  been cancelled/failed. Inspect: gh run list --workflow=deploy-production.yml"
  return 1
}

case "$TARGET" in
  staging)
    require_clean
    br="$(git branch --show-current)"
    if [ "$br" != "staging" ]; then
      echo "→ merging '$br' into staging"
      git checkout staging
      git pull --ff-only origin staging 2>/dev/null || true
      git merge --no-edit "$br"
    fi
    git push origin staging
    echo "✅ staging updated (no version bump) → auto-deploys to https://staging.odly.ai (~3–12 min)"
    ;;

  rc)
    require_clean
    confirm "Cut a $LEVEL release candidate and deploy it to staging?"
    br="$(git branch --show-current)"
    git checkout staging
    git pull --ff-only origin staging 2>/dev/null || true
    if [ "$br" != "staging" ]; then git merge --no-edit "$br"; fi
    npm version "$LEVEL" --no-git-tag-version >/dev/null
    ver="$(node -p "require('./package.json').version")"
    git add package.json package-lock.json
    git commit -m "chore: release candidate v$ver"
    git push origin staging
    echo "✅ RC v$ver → deploys to https://staging.odly.ai. QA it, then: npm run ship:prod"
    ;;

  prod)
    require_clean
    git checkout staging && git pull --ff-only origin staging
    ver="$(node -p "require('./package.json').version")"
    confirm "Promote staging → main and RELEASE v$ver TO PRODUCTION (no bump)?"
    git checkout main && git pull --ff-only origin main
    git merge --no-edit staging
    rel_sha="$(git rev-parse HEAD)"
    ./scripts/release-current.sh      # FE: push main (deploy) · BE: tag v$ver (deploy). NO bump.
    git checkout staging && git merge --ff-only main && git push origin staging
    echo "🚀 Released v$ver to production."
    verify_prod "$ver" "$rel_sha"
    ;;

  hotfix)
    require_clean
    confirm "HOTFIX: bump $LEVEL and release straight from main to PRODUCTION?"
    git checkout main && git pull --ff-only origin main
    ./scripts/release.sh "$LEVEL"     # bumps + releases (hotfix skips the RC/staging step)
    rel_ver="$(node -p "require('./package.json').version")"
    rel_sha="$(git rev-parse HEAD)"
    git checkout staging && git pull --ff-only origin staging && git merge --no-edit main && git push origin staging
    echo "🚀 Hotfix v$rel_ver released and merged back into staging."
    verify_prod "$rel_ver" "$rel_sha"
    ;;

  *)
    die "Usage: ship.sh <staging|rc|prod|hotfix> [patch|minor|major]"
    ;;
esac
