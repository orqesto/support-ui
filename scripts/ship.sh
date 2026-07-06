#!/usr/bin/env bash
#
# Unified deploy helper — the three workflows.
#
#   ship.sh staging            push `staging` → auto-deploys staging.odly.ai (QA)
#   ship.sh prod  [level]      promote: merge staging→main, bump version, deploy prod
#   ship.sh hotfix [level]     release straight from main, then merge back into staging
#
# level = patch (default) | minor | major
#
# Prod deploy per repo (both call ./scripts/release.sh, which differs):
#   - FE: release.sh pushes `main`  → push-to-main auto-deploys app.odly.ai
#   - BE: release.sh tags `vX.Y.Z`  → the tag deploys app.odly.ai
#
# prod/hotfix then BLOCK on verify_prod() until app.odly.ai actually serves the
# new build (BE: /api/health/version version · FE: release git sha in the bundle),
# so a cancelled/failed deploy surfaces instead of passing silently.
#
set -euo pipefail

# Re-exec from a stable /tmp copy so a `git checkout` mid-run can never pull
# this script file out from under the running shell (it may not exist on every
# branch yet). The copy holds the whole script in a fixed location.
if [ -z "${SHIP_REEXEC:-}" ]; then
  _tmp="$(mktemp)"; cp "$0" "$_tmp"
  SHIP_REEXEC=1 exec bash "$_tmp" "$@"
fi

cd "$(git rev-parse --show-toplevel)"

TARGET="${1:-}"
LEVEL="${2:-patch}"
PROD_URL="https://app.odly.ai"

die(){ echo "❌ $*" >&2; exit 1; }
# Only block on uncommitted changes to *tracked* files; untracked files
# (e.g. local .planning/ notes) are intentionally not committed and are fine.
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
    echo "✅ staging updated → auto-deploys to https://staging.odly.ai (~3–12 min)"
    ;;

  prod)
    require_clean
    confirm "Promote staging → main and RELEASE TO PRODUCTION ($LEVEL)?"
    git checkout staging && git pull --ff-only origin staging
    git checkout main    && git pull --ff-only origin main
    git merge --no-edit staging
    ./scripts/release.sh "$LEVEL"     # FE: pushes main (deploy) · BE: tags vX.Y.Z (deploy)
    rel_ver="$(node -p "require('./package.json').version")"
    rel_sha="$(git rev-parse HEAD)"
    git checkout staging && git merge --ff-only main && git push origin staging
    echo "🚀 Released v$rel_ver to production."
    verify_prod "$rel_ver" "$rel_sha"
    ;;

  hotfix)
    require_clean
    confirm "HOTFIX: release current main straight to PRODUCTION ($LEVEL)?"
    git checkout main && git pull --ff-only origin main
    ./scripts/release.sh "$LEVEL"
    rel_ver="$(node -p "require('./package.json').version")"
    rel_sha="$(git rev-parse HEAD)"
    git checkout staging && git pull --ff-only origin staging && git merge --no-edit main && git push origin staging
    echo "🚀 Hotfix v$rel_ver released and merged back into staging."
    verify_prod "$rel_ver" "$rel_sha"
    ;;

  *)
    die "Usage: ship.sh <staging|prod|hotfix> [patch|minor|major]"
    ;;
esac
