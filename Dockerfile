# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies + force rollup native binary for linux-arm64-musl (Alpine)
RUN npm install && npm install @rollup/rollup-linux-arm64-musl --save-optional 2>/dev/null || true

# Copy source
COPY . .

# The API this image's app talks to. Empty (the default) = same-origin: the app calls /api and
# opens its socket on the page's own origin, which nginx.conf proxies to the backend. Set it only
# for an API on another origin (and add that origin to nginx.conf's connect-src).
# An empty ENV still overrides .env.production (Vite lets the process env win over .env files),
# which names the hosted API.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

# Version info baked in at build time
ARG VITE_GIT_SHA=dev
ARG BUILD_TIME=unknown
ENV VITE_GIT_SHA=$VITE_GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

# Build application
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
