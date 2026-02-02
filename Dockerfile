# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Accept build arguments for environment variables
ARG POSTGRES_URL
ARG NEXT_PUBLIC_APP_URL
ARG BETTER_AUTH_SECRET
ARG OPENROUTER_API_KEY=""
ARG UNSPLASH_ACCESS_KEY=""

# Set environment variables for build
ENV NODE_ENV=production
ENV POSTGRES_URL=${POSTGRES_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
ENV UNSPLASH_ACCESS_KEY=${UNSPLASH_ACCESS_KEY}

# Install build dependencies for native modules (canvas, sqlite3, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for dependency caching
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

# Install dependencies with better error handling
# Use --non-interactive to prevent hanging, and don't use frozen-lockfile
# as it can be too strict and prevent proper resolution of devDependencies
RUN yarn install --non-interactive --network-timeout 100000 || yarn install

# Copy source code
COPY . .

# Build the Next.js application
RUN yarn run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install runtime dependencies only (for canvas and image processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libgif7 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

# Copy pre-built node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy other necessary files
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/postcss.config.mjs ./
COPY --from=builder /app/tsconfig.json ./

# Create non-root user for security
RUN useradd -m -u 1001 nextjs && chown -R nextjs:nextjs /app

USER nextjs

EXPOSE 3000

# Use dumb-init to properly handle signals and reaping zombies
ENTRYPOINT ["dumb-init", "--"]

# Start the Next.js application in production mode
CMD ["yarn", "start"]
