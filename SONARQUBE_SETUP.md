# SonarQube Integration Setup

This document explains the SonarQube CI/CD integration for the Artiste project.

## Overview

SonarQube is integrated into the project for continuous code quality analysis. It automatically runs on:
- Push to `main`, `develop`, or `dev-sec-ops` branches
- Pull requests to these branches
- Manual workflow dispatch

## Local Setup

### Prerequisites
- Docker and Docker Compose installed
- Node.js 20+ installed

### Running SonarQube Locally

1. **Start SonarQube services:**
```bash
docker-compose -f sonarqube.docker-compose.yml up -d
```

2. **Wait for services to be healthy:**
```bash
docker-compose -f sonarqube.docker-compose.yml ps
```

3. **Access SonarQube:**
- URL: http://localhost:9000
- Default credentials: `admin` / `admin`
- Change password on first login

### Configure Project in SonarQube

1. Log in to SonarQube
2. Click "Create project"
3. Set project key to `artiste`
4. Generate a token for authentication
5. Save the token as `SONAR_TOKEN` environment variable

## GitHub Actions Setup

### Required Secrets

Add these secrets to your GitHub repository:

- `SONAR_HOST_URL`: URL to your SonarQube instance (e.g., `http://sonarqube.example.com` or `http://localhost:9000`)
- `SONAR_TOKEN`: Authentication token from SonarQube

### Adding Secrets

1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add `SONAR_HOST_URL` and `SONAR_TOKEN`

## Running Analysis Locally

### Via npm script:
```bash
# Install dependencies
npm ci

# Run linting
npm run lint

# Run tests with coverage
npm run test:coverage

# Run SonarQube analysis
npm run sonar
```

### Via sonar-scanner CLI:
```bash
sonar-scanner \
  -Dsonar.projectKey=artiste \
  -Dsonar.sources=app,components,lib,scripts \
  -Dsonar.host.url=http://localhost:9000 \
  -Dsonar.login=YOUR_TOKEN_HERE
```

## Configuration Files

- **sonar-project.properties**: Main SonarQube configuration
- **.github/workflows/sonarqube.yml**: GitHub Actions workflow
- **jest.config.js**: Jest testing configuration
- **.sonarignore**: Files to exclude from analysis

## Quality Gates

The project uses SonarQube's default quality gates. You can customize them in the SonarQube UI:
- Code coverage thresholds
- Complexity limits
- Bug/Security hotspot thresholds

## Reports

Analysis reports are available:
- In SonarQube UI at http://localhost:9000
- In GitHub Actions workflow logs
- ESLint reports: `reports/eslint-report.json`
- Coverage reports: `coverage/lcov.info`

## Troubleshooting

### SonarQube won't start
```bash
# Check logs
docker-compose -f sonarqube.docker-compose.yml logs sonarqube

# Reset and restart
docker-compose -f sonarqube.docker-compose.yml down -v
docker-compose -f sonarqube.docker-compose.yml up -d
```

### Analysis fails in GitHub Actions
1. Verify `SONAR_HOST_URL` and `SONAR_TOKEN` are set correctly
2. Check if SonarQube instance is accessible
3. Ensure project token has proper permissions

### Coverage not detected
1. Run `npm run test:coverage` to generate coverage
2. Verify `coverage/lcov.info` exists
3. Check `sonar-project.properties` lcov path

## Next Steps

1. Run `npm install` to install new dependencies
2. Start SonarQube locally: `docker-compose -f sonarqube.docker-compose.yml up -d`
3. Add GitHub secrets for CI/CD integration
4. Push to trigger workflow
