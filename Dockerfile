# Using a multi-stage build for simplicity and to ensure all dependencies are available.
FROM node:22.19-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat yarn python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev libjpeg-turbo-dev giflib-dev
WORKDIR /app
# Copy all necessary files at the beginning.
COPY package.json yarn.lock ./
# Install dependencies.
RUN yarn install --pure-lockfile --no-cache

FROM deps AS builder
WORKDIR /app
# Accept build arguments for environment variables
ARG POSTGRES_URL
ARG NEXT_PUBLIC_APP_URL
ARG BETTER_AUTH_SECRET
ARG OPENROUTER_API_KEY
ARG UNSPLASH_ACCESS_KEY

# Set environment variables for build
ENV POSTGRES_URL=${POSTGRES_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
ENV UNSPLASH_ACCESS_KEY=${UNSPLASH_ACCESS_KEY}
ENV NODE_ENV=production

# Copy dashboard source
COPY . .
# Build Next.js standalone output
ENV STANDALONE=true
RUN yarn build && ls -l .next && ls -la .next/standalone || true

# Production image
FROM node:22.19-alpine AS production
WORKDIR /app
ENV NODE_ENV=development
ENV PORT=3004
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# Copy the standalone output and other necessary files from the base stage.
COPY --from=builder /app/.next/standalone/ ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=deps /app/node_modules ./node_modules
USER nextjs
EXPOSE 3004
CMD ["node", "server.js"]