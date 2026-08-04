# 10 — Final Go-Live Checklist

Print this. Tick as you go.

## Day-0 (T-7 to T-0)

### Infrastructure
- [ ] Provision MongoDB Atlas M10 cluster (replicaset, backups on)
- [ ] Register domains: `amass.africa`, `www`, `api`, `admin` on Cloudflare
- [ ] Enable Cloudflare TLS, WAF, and bot fight mode
- [ ] Provision Emergent object storage bucket for property + marketplace media

### Backend
- [ ] Set production `MONGO_URL`, `DB_NAME=amass_production`, strong `JWT_SECRET`
- [ ] Set `CORS_ORIGINS` to the exact production hostnames (no `*`)
- [ ] Set `MOCK_PAYMENT=false`, live Paystack + Flutterwave keys, `PUBLIC_API_BASE`
- [ ] Set `ADMIN_EMAILS` allowlist
- [ ] Deploy container, verify `curl https://api.amass.africa/api/properties?limit=1`
- [ ] Register Paystack webhook URL `POST /api/payments/paystack/webhook`
- [ ] Register Flutterwave webhook URL `POST /api/payments/flutterwave/webhook`

### Frontend (web)
- [ ] `REACT_APP_BACKEND_URL=https://api.amass.africa` in prod env
- [ ] `yarn build` → deploy `build/` to Cloudflare Pages (project `amass-web`)
- [ ] Attach domains: `amass.africa`, `www.amass.africa`, `admin.amass.africa`
- [ ] Verify Landing loads, login works, admin route reachable for admin email

### Mobile
- [ ] Update `EXPO_PUBLIC_BACKEND_URL` to production API
- [ ] Rotate Google Maps API key in `app.json`; move to EAS secrets
- [ ] Bump version, `eas build --profile production --platform android`
- [ ] `eas submit -p android` → Play Store internal track

### Data
- [ ] Run production seed (only if empty): `POST /api/seed` behind admin auth
- [ ] Promote your `admin@amass.africa` account manually (`is_admin=true`)

### Security (must-fix)
- [ ] Add `slowapi` login rate-limit
- [ ] Bump password minimum length to 8
- [ ] Sentry DSN set on backend + web + mobile
- [ ] MongoDB IP allowlist set to backend IPs only

## Day-0 (T-0, go-live)

- [ ] Health-check: `/api/properties?limit=1` returns 200
- [ ] Health-check: `/api/admin/whoami` returns 200 for admin (403 for non-admin)
- [ ] Register a real user via `www.amass.africa/register`
- [ ] Confirm same account works on mobile
- [ ] Perform a test payment (₦500 Paystack) → confirm wallet credit
- [ ] Approve one pending property → confirm it appears verified on `www` and app
- [ ] Cutover DNS → 100% traffic to new infra

## Day-1 (post-launch)

- [ ] Monitor Sentry error rate < 0.1% of requests
- [ ] Monitor MongoDB CPU < 40% and connections < 30% of pool
- [ ] Verify daily `mongodump` succeeded
- [ ] Broadcast go-live to email list via Resend

## Day-7 review
- [ ] Audit `audit_log` for unexpected admin actions
- [ ] Review new-user funnel: register → verify → save first property
- [ ] Review payment failure rate and refund count

## Rollback triggers
Roll back to previous container tag **immediately** if any of:
- 5xx rate on `/api/*` > 2% over 5 minutes
- Payment webhook failure rate > 5%
- Total user login failure rate > 10%
- Any confirmed data loss

## Sign-off
- [ ] Product __________________  date ______
- [ ] Engineering _______________  date ______
- [ ] Security _________________  date ______
- [ ] Ops ______________________  date ______

