# Docker Setup Guide

This guide will help you run the Artiste application using Docker and Docker Compose.

## Prerequisites

- Docker installed ([Download Docker](https://www.docker.com/products/docker-desktop))
- Docker Compose installed (usually included with Docker Desktop)
- At least 2GB of available memory for Docker

## Quick Start

### 1. Configure Environment Variables

Create or update your `.env` file:

```bash
# Copy the environment template
cp .env.docker .env.local
```

Edit `.env.local` with your actual configuration:

```bash
nano .env.local
```

**Important variables:**
- `POSTGRES_PASSWORD`: Change to a secure password
- `BETTER_AUTH_SECRET`: Generate with `openssl rand -base64 32`
- `NEXT_PUBLIC_APP_URL`: Set to your application URL

### 2. Build and Start Containers

```bash
# Full stack with PostgreSQL
docker compose up --build

# Or run in detached mode
docker compose up -d --build

# Development without database
docker compose -f docker-compose.dev.yml up --build

# Production without database
docker compose -f docker-compose.prod.yml up --build
```

### 3. Access the Application

- **App**: http://localhost:3000
- **Database**: localhost:5432

## Environment Variables

Create a `.env` file in the project root with:

```env
# Node Environment
NODE_ENV=development

# PostgreSQL Configuration
POSTGRES_USER=artiste
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=artiste_db
POSTGRES_PORT=5432

# Application Configuration
APP_PORT=3000

# Database URL
POSTGRES_URL=postgresql://artiste:your_secure_password@postgres:5432/artiste_db

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Authentication Secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=your_generated_secret
```

## Docker Compose Files

### `docker-compose.yml` (Full Stack)
- Includes PostgreSQL database service
- Application automatically waits for database health check
- Data persistence with named volume
- Internal networking between services

### `docker-compose.dev.yml` (Development)
- Application only
- No database (use external database)
- Volume mounts for hot reload
- Development environment optimized

### `docker-compose.prod.yml` (Production)
- Application only
- No database (use managed service)
- Health checks enabled
- Always restart policy

## Common Commands

### View Running Containers
```bash
docker compose ps
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f postgres
```

### Stop Containers
```bash
docker compose down
```

### Stop and Remove Volumes
```bash
docker compose down -v
```

### Rebuild Containers
```bash
docker compose up --build
```

### Access Database Shell
```bash
docker compose exec postgres psql -U artiste -d artiste_db
```

### Run Database Migrations
```bash
docker compose exec app npm run db:push
```

### Execute Command in App Container
```bash
docker compose exec app npm run build
docker compose exec app npm run lint
```

## Dockerfile Details

The Dockerfile uses a **multi-stage build** approach:

1. **Builder Stage** (node:20-slim)
   - Installs build dependencies
   - Runs `npm ci` to install all dependencies
   - Builds Next.js application
   - Result: Complete .next build output

2. **Production Stage** (node:20-slim)
   - Lighter runtime dependencies only
   - Copies pre-built application from builder
   - Copies node_modules from builder (avoiding rebuild)
   - Creates non-root user for security
   - Final image size: ~600-800MB

## Troubleshooting

### Container fails to start
```bash
docker compose logs app
```

### Database connection refused
- Ensure postgres service is healthy: `docker compose ps`
- Wait a few seconds for database to initialize
- Restart app: `docker compose restart app`

### Port already in use
Update in `.env.local`:
```env
APP_PORT=3001
POSTGRES_PORT=5433
```

### Permission denied
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Build timeouts
- Increase Docker memory allocation
- Check network connectivity
- Try `docker compose build --no-cache`

## Production Deployment

### Using Docker Registry

```bash
# Build image
docker build -t your-registry/artiste:1.0.0 .

# Push to registry
docker push your-registry/artiste:1.0.0
```

### Production Environment Setup

```env
NODE_ENV=production
POSTGRES_URL=postgresql://user:password@prod-db-host:5432/artiste_db
NEXT_PUBLIC_APP_URL=https://artiste.example.com
BETTER_AUTH_SECRET=<generated_secure_secret>
```

### Recommended: Use Managed Database

- **AWS RDS**: PostgreSQL managed service
- **Digital Ocean**: Managed PostgreSQL
- **Supabase**: PostgreSQL-as-a-Service
- **Heroku Postgres**: Cloud PostgreSQL

## Performance Optimization

### Reduce Image Size
- Use `.dockerignore` to exclude unnecessary files
- Multi-stage build keeps production image lean
- Remove development dependencies with `--omit=dev`

### Improve Build Speed
- Use Docker layer caching
- Pin dependency versions
- Minimize base image size

### Runtime Performance
- Use health checks for orchestration
- Set appropriate memory limits
- Use dumb-init for proper signal handling

## Security Best Practices

✅ Non-root user (nextjs) running the app
✅ Layer caching for dependency security
✅ Health checks for automatic recovery
✅ Environment variables for secrets (not hardcoded)
✅ `.dockerignore` prevents leaking source files
✅ dumb-init for proper signal handling

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Next.js Docker Documentation](https://nextjs.org/docs/deployment/docker)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Node.js Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
