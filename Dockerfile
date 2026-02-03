# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build arguments for environment variables
ARG POSTGRES_URL
ARG NEXT_PUBLIC_APP_URL
ARG BETTER_AUTH_SECRET

# Set environment variables for build
ENV POSTGRES_URL=${POSTGRES_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET} \
    NODE_ENV=development

# Install build dependencies for native modules
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copy package files
COPY --chown=node:node package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Install all dependencies (including dev)
RUN npm ci --prefer-offline --no-audit

# Copy source code
COPY --chown=node:node . .

# Build the Next.js application
ENV NODE_ENV=production
RUN npm run build

# Prune dev dependencies to reduce image size
RUN npm prune --production

# Clean up build dependencies
RUN apk del .build-deps

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install only runtime dependencies for canvas libraries
RUN apk add --no-cache \
    dumb-init \
    cairo \
    jpeg \
    pango \
    giflib

# Create non-root user with minimal privileges (use existing node user)
# Set proper file permissions
RUN chown -R node:node /app

# Copy package files
COPY --chown=node:node --from=builder /app/package.json /app/package-lock.json* /app/yarn.lock* /app/pnpm-lock.yaml* ./

# Copy pre-built node_modules from builder
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public

# Switch to non-root user
USER node

# Set environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--disable-warning=ExperimentalWarning"

EXPOSE 3000

# Use dumb-init to properly handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the Next.js application
CMD ["npm", "start"]
