# Production Migration

## Step 2: Environment and secrets

- Copy [`.env.example`](/D:/chicken/.env.example) to `.env`
- Set production values for:
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `WEB_BASE_URL`
  - `API_BASE_URL`
  - `ALLOWED_ORIGINS`
  - `EMAIL_FROM`
  - `RESEND_API_KEY`

## Step 3: API deployment

- The API is configured for Render via [render.yaml](/D:/chicken/render.yaml)
- Health endpoints:
  - `/api/health`
  - `/api/ready`
  - `/api/metrics`
- Render should point to `apps/api` with `npm start`

## Step 4: Web deployment

- The web app is configured for Vercel via [vercel.json](/D:/chicken/vercel.json)
- Build requirements:
  - `npm run runtime:config`
  - `npm run styles:build`

## Step 5: Email verification and password reset

- Registration now supports email verification
- Reset password flow is available through:
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`
  - `POST /api/auth/verify-email`
  - `POST /api/auth/resend-verification`

## Step 6: Backups and monitoring

- JSON backups can be created with:
  - `npm run api:backup`
- JSON backups can be restored with:
  - `npm run api:restore -- <backup-file.json>`
- Health checks:
  - `npm run api:health-check`
- Monitoring workflow:
  - [monitor-production.yml](/D:/chicken/.github/workflows/monitor-production.yml)

## Step 7: Domain and HTTPS

- Point the web domain to Vercel
- Point the API subdomain to Render
- Update:
  - `WEB_BASE_URL`
  - `API_BASE_URL`
  - `PUBLIC_WEB_BASE_URL`
  - `PUBLIC_API_BASE_URL`
  - `ALLOWED_ORIGINS`

## Step 8: GitHub CI/CD

- CI is defined in [ci.yml](/D:/chicken/.github/workflows/ci.yml)
- Web deployment is defined in [deploy-web.yml](/D:/chicken/.github/workflows/deploy-web.yml)
- API deployment hook is defined in [deploy-api.yml](/D:/chicken/.github/workflows/deploy-api.yml)
- Required GitHub secrets:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
  - `PUBLIC_WEB_BASE_URL`
  - `PUBLIC_API_BASE_URL`
  - `PUBLIC_SUPPORT_EMAIL`
  - `PROD_HEALTHCHECK_URL`
  - `RENDER_DEPLOY_HOOK_URL`
