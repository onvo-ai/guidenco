# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Accept build arguments for environment variables
ARG POSTGRES_URL
ARG NEXT_PUBLIC_APP_URL
ARG BETTER_AUTH_SECRET

# Set environment variables for build
ENV POSTGRES_URL=${POSTGRES_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install only runtime dependencies for canvas libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libgif7 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Copy pre-built node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Create non-root user for security
RUN useradd -m -u 1001 nextjs

USER nextjs

EXPOSE 3000

# Use dumb-init to properly handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the Next.js application
CMD ["npm", "start"]
