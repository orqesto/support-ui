# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies + force rollup native binary for linux-arm64-musl (Alpine)
RUN npm install && npm install @rollup/rollup-linux-arm64-musl --save-optional 2>/dev/null || true

# Copy source
COPY . .

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
