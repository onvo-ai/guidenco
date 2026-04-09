# syntax=docker/dockerfile:1.6
# ============================================================================
# HARDENED DOCKERFILE FOR PRODUCTION
# ============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - Install dependencies and build the application
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

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

# Install all dependencies (need devDependencies for build)
RUN npm ci && \
    npm audit --audit-level=moderate || true

# Download Remotion-managed Chrome Headless Shell into the image
# This avoids all system Chromium compatibility issues at runtime
RUN npx remotion browser ensure

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
FROM node:22-bookworm-slim AS runner

# Metadata labels (OCI standard)
LABEL org.opencontainers.image.title="Guidenco" \
    org.opencontainers.image.description="Secure Next.js application" \
    org.opencontainers.image.vendor="onvo-ai" \
    org.opencontainers.image.source="https://github.com/onvo-ai/guidenco" \
    security.hardened="true"

WORKDIR /app

# Install runtime dependencies
# Chrome deps per https://www.remotion.dev/docs/docker
# canvas/pango deps for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    ca-certificates \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libgif7 \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgbm-dev \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libdrm2 \
    libnspr4 \
    libcups2 \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && apt-get clean

# Create non-root user with specific UID/GID (no home directory, no shell)
RUN groupadd --gid 1001 nextjs && \
    useradd --uid 1001 --gid 1001 --no-create-home --shell /usr/sbin/nologin nextjs

# Copy built application with proper ownership (using standalone output)
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone /app/.next/standalone
COPY --from=builder --chown=nextjs:nextjs /app/.next/static /app/.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public /app/public

# Copy Remotion-managed Chrome Headless Shell downloaded during build.
# Remotion looks for it at <cwd>/node_modules/.remotion at runtime.
# The app runs with CWD=/app so we place it at /app/node_modules/.remotion.
COPY --from=builder --chown=nextjs:nextjs /app/node_modules/.remotion /app/node_modules/.remotion

# Set file permissions
RUN mkdir -p /app/.next/cache /tmp \
    && chown -R nextjs:nextjs /app /tmp \
    && chmod -R 750 /app \
    && chmod -R 770 /app/.next/cache

# Production environment variables
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--max-old-space-size=512 --no-experimental-fetch"

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
