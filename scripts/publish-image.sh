#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
GIT_SHA=$(git rev-parse --short HEAD)
IMAGE="ghcr.io/orqesto/odly-frontend"

# Ensure authenticated to GHCR
if [ -n "$GHCR_PAT" ]; then
  echo "$GHCR_PAT" | docker login ghcr.io -u "${GHCR_USER:-orqesto}" --password-stdin
elif command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
  gh auth token | docker login ghcr.io -u "$(gh api user --jq .login)" --password-stdin
else
  echo "Not logged in to ghcr.io. Either:"
  echo "  1. Run: gh auth login"
  echo "  2. Or:  GHCR_PAT=your_pat npm run publish:image"
  exit 1
fi

echo "Building and pushing $IMAGE:v$VERSION (linux/amd64 + linux/arm64)..."

# Ensure multiarch builder exists with docker-container driver
if ! docker buildx inspect multiarch &>/dev/null; then
  docker buildx create --name multiarch --driver docker-container --bootstrap
fi

docker buildx build \
  --builder multiarch \
  --platform linux/amd64,linux/arm64 \
  --cache-from type=registry,ref=$IMAGE:buildcache \
  --cache-to type=registry,ref=$IMAGE:buildcache,mode=min \
  --build-arg VITE_GIT_SHA=$GIT_SHA \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --push \
  -t $IMAGE:v$VERSION \
  -t $IMAGE:latest \
  .

echo "Done: $IMAGE:v$VERSION + latest"
