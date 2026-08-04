# 03 — API Health Report

## Route inventory (all under `/api`)

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/apple`
- `GET  /api/auth/me`

### Properties (public)
- `GET  /api/properties` — filters: listing_type, property_type, min/max_price, bedrooms, city, verified, listing_source, q, min/max_lat, min/max_lng, token_filter
- `GET  /api/properties/:id`
- `POST /api/properties` (authenticated)
- `POST /api/properties/:id/view`
- `POST /api/properties/unlock`
- `GET  /api/properties/:id/intelligence`

### Favorites
- `POST /api/favorites/toggle`
- `GET  /api/favorites` · `GET /api/favorites/ids`

### Marketplace
- `GET  /api/marketplace` · `/api/marketplace/collections` · `/api/marketplace/vendors` · `/api/marketplace/items/:id`
- `POST /api/marketplace/items` (v2 create classified)
- `POST /api/marketplace/items/:id/view` · `.../save` · `.../offer`
- `GET  /api/marketplace/saved` · `.../saved/ids` · `.../my-listings`
- `POST /api/marketplace/fixa/book` · `POST /api/marketplace/fixa/bookings/:id/complete`

### Cart / Checkout
- `GET/POST /api/cart/*` · `POST /api/checkout`

### Neighborhoods & Map
- `GET  /api/neighborhoods`
- `GET  /api/map/heatmap` · `/api/map/polygon-search`

### Wallet & Tokens (MASS + FIX)
- `GET  /api/wallet/me` · `/api/wallet/mass` · `/api/wallet/fix` · `/api/wallet/dual`
- `GET  /api/wallet/transactions` · `/api/wallet/unlocks`
- `GET  /api/tokens/bundles` · `/api/wallet/fix/bundles`
- `POST /api/tokens/purchase` · `/api/wallet/fix/purchase` · `/api/wallet/fix/earn` · `/api/wallet/fix/spend`
- `GET  /api/subscriptions/plans` · `POST /api/subscriptions/subscribe` · `/api/subscriptions/cancel`

### Agents
- `POST /api/agents/apply` · `GET /api/agents/me` · `GET /api/agents/:user_id` · `GET /api/agents/:user_id/listings`
- `GET  /api/agent/dashboard` · `/api/agent/listings` · `/api/agent/listings-analytics` · `/api/agent/leads`

### Payments (Paystack + Flutterwave)
- `POST /api/payments/initialize` · `GET /api/payments/status/:ref`
- `POST /api/payments/paystack/webhook` · `POST /api/payments/flutterwave/webhook`
- `GET  /api/payments/mock/:ref` (fallback) · `/api/payments/redirect`

### Property improvement (BNPL)
- `GET  /api/improve/catalog` · `/api/improve/mine` · `/api/improve/property/:id`
- `POST /api/inspections` · `GET /api/inspections/:id` · `GET /api/inspections/mine`
- `POST /api/finance/applications` · `GET /api/finance/applications/:id`
- `POST /api/projects` · `GET /api/projects/:id` · `PATCH /api/projects/:id/milestone`

### Notifications, Saved searches, Ads, Earn, Referrals, AI
- Full parity with pre-consolidation set.

### **NEW** — Admin Portal (`/api/admin/*`)
- `GET  /api/admin/whoami` · `/api/admin/dashboard`
- `GET  /api/admin/properties` · `POST /api/admin/properties/:id/approve` · `DELETE /api/admin/properties/:id`
- `GET  /api/admin/users` · `PATCH /api/admin/users/:id/role`
- `GET  /api/admin/agents` · `POST /api/admin/agents/:user_id/decision`
- `GET  /api/admin/marketplace` · `DELETE /api/admin/marketplace/:id`
- `GET  /api/admin/orders` · `/api/admin/audit-log` · `/api/admin/payments`

## Standard response envelope
- Success: JSON object or list, HTTP 200/201
- Not found: HTTP 404 `{"detail": "..."}`
- Auth: HTTP 401 `{"detail": "Not authenticated"}`, 403 `{"detail": "Admin access required"}`
- Validation: HTTP 400/422 via FastAPI Pydantic errors
- Payment shortfall: HTTP 402 with `{"error":"insufficient_tokens","required":N,"balance":N,"shortfall":N}`

## Live verification (curl smoke test)
- `GET /api/properties?limit=1` — ✅ returns seeded properties
- `GET /api/neighborhoods` — ✅ returns 5 neighborhoods
- `POST /api/auth/register` — ✅ returns access_token
- `GET /api/auth/me` (with token) — ✅ returns UserOut

## Rate limiting
- Not yet enforced. **Recommendation:** add `slowapi` middleware — target 60 req/min per IP on unauthenticated routes, 240 req/min per authenticated user.

