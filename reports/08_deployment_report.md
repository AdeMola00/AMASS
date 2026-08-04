# 08 — Deployment Report

## Target architecture (production)

```
              ┌──────────────────┐
              │   Cloudflare     │  ← DNS, WAF, CDN, TLS
              └────────┬─────────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
 www.amass.africa   admin.amass       api.amass
   (Landing/App     .africa           .africa
    unified web)    (Admin subpath)   (FastAPI)
       │               │                │
       └───────────────┴────────────────┘
                       │
                       ├─ MongoDB Atlas (M10 cluster, replica set)
                       ├─ Redis (Upstash) — optional caching
                       ├─ Emergent Object Storage — images/documents
                       ├─ Resend — transactional email
                       ├─ Paystack + Flutterwave — payments
                       └─ Emergent Universal LLM Key — AI search

Google Play Store
   └─ AMASS Mobile (Expo build) → EXPO_PUBLIC_BACKEND_URL=https://api.amass.africa
```

## Repo layout (this workspace = production frontend + backend)

```
/app
├─ backend/            # FastAPI, port 8001
│  ├─ server.py
│  ├─ admin.py           NEW
│  ├─ tokens.py, payments.py, ...
│  └─ .env               MONGO_URL, DB_NAME, JWT_SECRET, EMERGENT_LLM_KEY, ...
├─ frontend/           # React web (Landing + Admin unified), port 3000
│  ├─ src/pages/         Landing, Properties, Marketplace, Admin/*
│  └─ .env               REACT_APP_BACKEND_URL
└─ reports/            # This deliverables set
```

## Environment variables (production)

Backend `.env` — never committed:
```
MONGO_URL=mongodb+srv://…@amass-prod.xxx.mongodb.net
DB_NAME=amass_production
CORS_ORIGINS=https://amass.africa,https://admin.amass.africa,https://app.amass.africa,capacitor://localhost
JWT_SECRET=<64-char random>
EMERGENT_LLM_KEY=sk-emergent-…
ADMIN_EMAILS=admin@amass.africa
MOCK_PAYMENT=false
PAYSTACK_SECRET_KEY=sk_live_…
FLUTTERWAVE_SECRET_KEY=FLWSECK-…
FLUTTERWAVE_SECRET_HASH=<hash>
PUBLIC_API_BASE=https://api.amass.africa
```

Frontend `.env`:
```
REACT_APP_BACKEND_URL=https://api.amass.africa
```

Mobile app EAS build env:
```
EXPO_PUBLIC_BACKEND_URL=https://api.amass.africa
```

## Deployment steps

1. **Provision infra**
   - MongoDB Atlas cluster (M10+) with a service user
   - Cloudflare zone → DNS records for www / api / admin
   - Emergent object storage bucket + Resend workspace

2. **Backend deploy** (Emergent or Docker to any container platform)
   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY backend/requirements.txt .
   RUN pip install --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ -r requirements.txt
   COPY backend/ ./
   CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
   ```

3. **Frontend deploy**
   ```
   cd /app/frontend && yarn build
   # Upload build/ to Cloudflare Pages or Vercel
   ```

4. **Mobile deploy**
   ```
   cd frontend (mobile repo)
   eas build --profile production --platform android
   eas submit -p android
   ```

5. **Post-deploy verification**
   - `curl https://api.amass.africa/api/properties?limit=1` → 200
   - Web login as `admin@amass.africa` → `/admin` accessible
   - Mobile app connects to same API, same account works

## Rollback strategy
- Blue/green deploy on backend: previous container stays running behind a health-check.
- Frontend static hosting → previous build kept for one-click rollback in Cloudflare Pages.
- Mongo: nightly `mongodump` snapshot; Atlas Point-in-time restore for last 24h.

## CI / CD
- **Suggested**: GitHub Actions on push to `main` → run pytest, build, deploy.
- Test suite already partially exists in `/app/backend/tests/`.

## Monitoring & alerting
- Emergent platform logs + `sentry-sdk` for backend and `@sentry/react` for frontend.
- Uptime pings via BetterUptime or UptimeRobot to `GET /api/properties?limit=1`.
- Slack webhook alert on any 5xx spike.

