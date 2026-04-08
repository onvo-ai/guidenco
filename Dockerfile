# syntax=docker/dockerfile:1.6
# ============================================================================
# HARDENED DOCKERFILE FOR PRODUCTION
# ============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - Install dependencies and build the application
# -----------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (canvas, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && apt-get clean

# Copy only dependency files for better layer caching
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Skip Puppeteer Chrome download — system Chromium is used at runtime
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install all dependencies (need devDependencies for build)
RUN npm ci && \
    npm audit --audit-level=moderate || true

# Accept build arguments
ARG COOLIFY_URL
ARG COOLIFY_FQDN
ARG NODE_ENV
ARG POSTGRES_URL
ARG NEXT_PUBLIC_APP_URL
ARG BETTER_AUTH_SECRET
ARG SERVICE_URL_APP
ARG SERVICE_FQDN_APP
ARG COOLIFY_BUILD_SECRETS_HASH

# Set environment variables for build
ENV POSTGRES_URL=${POSTGRES_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--max-old-space-size=1024"

# Copy source code
COPY . .

# Build the application
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime - Minimal secure image
# -----------------------------------------------------------------------------
FROM node:20-slim AS runner

# Metadata labels (OCI standard)
LABEL org.opencontainers.image.title="Guidenco" \
    org.opencontainers.image.description="Secure Next.js application" \
    org.opencontainers.image.vendor="onvo-ai" \
    org.opencontainers.image.source="https://github.com/onvo-ai/guidenco" \
    security.hardened="true"

WORKDIR /app

# Install only runtime dependencies + security hardening
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libgif7 \
    ca-certificates \
    chromium \
    fonts-liberation \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libnspr4 \
    libnss3 \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && apt-get clean \
    && printf '#!/bin/sh\nexec /usr/bin/chromium --disable-crash-reporter --crash-dumps-dir=/tmp "$@"\n' \
       > /usr/local/bin/chromium-wrapper \
    && chmod +x /usr/local/bin/chromium-wrapper \
    # Remove unnecessary utilities that could be exploited
    && rm -rf /usr/bin/apt* /usr/bin/dpkg* /usr/bin/wget /usr/bin/curl 2>/dev/null || true \
    # Remove shell access for added security (comment out if debugging needed)
    # && rm -rf /bin/sh /bin/bash 2>/dev/null || true \
    # Set restrictive umask
    && echo "umask 027" >> /etc/profile

# Create non-root user with specific UID/GID (no home directory, no shell)
RUN groupadd --gid 1001 nextjs && \
    useradd --uid 1001 --gid 1001 --no-create-home --shell /usr/sbin/nologin nextjs

# Copy built application with proper ownership (using standalone output)
# Copy standalone build
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone /app/.next/standalone
COPY --from=builder --chown=nextjs:nextjs /app/.next/static /app/.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public /app/public

# Set file permissions (readable/executable for user and group)
RUN mkdir -p /app/.next/cache /tmp \
    && chown -R nextjs:nextjs /app /tmp \
    && chmod -R 750 /app \
    && chmod -R 770 /app/.next/cache

# Production environment variables
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--max-old-space-size=512 --no-experimental-fetch" \
    REMOTION_CHROME_EXECUTABLE_PATH="/usr/local/bin/chromium-wrapper" \
    PUPPETEER_EXECUTABLE_PATH="/usr/local/bin/chromium-wrapper"

# Drop all capabilities except what's needed
# Note: This requires --cap-drop=ALL --cap-add=... at runtime

# Switch to non-root user
USER nextjs:nextjs

# Expose port (non-privileged)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))" || exit 1

# Use dumb-init to properly handle signals (PID 1 zombie reaping)
ENTRYPOINT ["dumb-init", "--"]

# Start the application using the standalone server
CMD ["node", ".next/standalone/server.js"]
