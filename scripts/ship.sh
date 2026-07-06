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

die(){ echo "❌ $*" >&2; exit 1; }
# Only block on uncommitted changes to *tracked* files; untracked files
# (e.g. local .planning/ notes) are intentionally not committed and are fine.
require_clean(){ [ -z "$(git status --porcelain --untracked-files=no)" ] || die "Uncommitted changes to tracked files — commit or stash first."; }
confirm(){ read -r -p "$1 [y/N] " a; [ "$a" = "y" ] || [ "$a" = "Y" ] || die "Aborted."; }

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
    git checkout staging && git merge --ff-only main && git push origin staging
    echo "✅ Released to production. Verify: /api/health/version (BE) or the live site (FE)."
    ;;

  hotfix)
    require_clean
    confirm "HOTFIX: release current main straight to PRODUCTION ($LEVEL)?"
    git checkout main && git pull --ff-only origin main
    ./scripts/release.sh "$LEVEL"
    git checkout staging && git pull --ff-only origin staging && git merge --no-edit main && git push origin staging
    echo "✅ Hotfix released and merged back into staging."
    ;;

  *)
    die "Usage: ship.sh <staging|prod|hotfix> [patch|minor|major]"
    ;;
esac
