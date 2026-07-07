#!/bin/bash
#
# Release the CURRENT package.json version to production — NO version bump.
# Used by `ship.sh prod` in the RC flow. The FE deploys on push to `main` (no tag), so
# this just pushes main; the version was already bumped by `ship:rc` and tested on
# staging, so prod serves that exact version. (Bump-and-release lives in release.sh.)
#
set -e
VERSION=$(node -p "require('./package.json').version")
git push origin main
echo "Released fe v$VERSION — push-to-main auto-deploys app.odly.ai."
