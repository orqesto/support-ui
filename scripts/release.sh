#!/bin/bash
set -e

TYPE=${1:-patch}

if [[ "$TYPE" != "patch" && "$TYPE" != "minor" && "$TYPE" != "major" ]]; then
  echo "Usage: ./scripts/release.sh [patch|minor|major]"
  exit 1
fi

npm version $TYPE --no-git-tag-version

VERSION=$(node -p "require('./package.json').version")

git add package.json package-lock.json
git commit -m "chore: release fe v$VERSION"
git push origin main

echo "Released fe v$VERSION — CI will tag the image automatically"
