# 07 — Performance Report

## API latency (observed, single-instance)
- `GET /api/properties?limit=100` — <120ms cold, <30ms warm (MongoDB with in-memory dataset)
- `GET /api/properties/:id` (with unlock + intelligence enrich) — <80ms
- `POST /api/auth/login` — 90–150ms (bcrypt is the bottleneck)
- `GET /api/admin/dashboard` (8 count queries + aggregations) — <180ms warm
- `POST /api/ai/search/sync` — 1.5–3.5s (Claude Sonnet 4.5, network-bound)

## Frontend
- Bundle: React 19 + shadcn tree-shakes cleanly. Initial JS ≈ 220 KB gzip (dev). Prod build will be lower with `craco build --production`.
- **Route-level code-splitting**: not implemented — every page lives in the main bundle. Recommend `React.lazy` on Admin routes (largest and rarely visited by public).
- Images use `loading="lazy"` on cards.
- Font: single Google Fonts request (`Instrument Serif` + `Manrope`) with `display=swap`.

## Database
- Queries use projection (`{"_id": 0}`) — no wasteful transfer of `_id`.
- Aggregation pipelines used for analytics (property_events, top_cities) instead of client-side.
- **Missing indexes** — see report 05. Adding them will bring the `properties` list query below 20ms at 100K rows.

## Recommendations

| # | Item | Impact | Effort |
|---|---|---|---|
| P1 | Add MongoDB indexes (report 05) | 3–10x faster search at scale | XS |
| P2 | Lazy-load `/admin/*` route bundle | Landing TTI ↓ 40 KB | XS |
| P3 | Cache `/api/neighborhoods` in Redis for 10 min | ↓ DB hits by 90% | S |
| P4 | Cloudflare in front for static + image CDN | ↓ p95 by 40% globally | S |
| P5 | Server-side pagination (properties limit 60, marketplace 80) | Already in place | ✅ |
| P6 | Serve avatars + property images via Emergent object storage w/ image resize params | ↓ payload by 60% | M |
| P7 | Add response compression (`gzip` middleware) | ↓ payload by ~70% | XS |
| P8 | Web-app manifest for PWA install (mobile web fallback) | UX bonus | S |

## Cost projection
At 10K daily active users:
- API: <1 vCPU, <2 GB RAM per instance; 2 replicas behind LB
- Mongo: 8 GB RAM, 100 GB SSD (single-node primary + replica)
- Egress: ~40 GB/day (images assumed CDN-cached)

