# 02 — Synchronization Report

## Objective
Prove that data flowing through **any** surface (Landing web, Admin portal, Mobile app) reads/writes to the same source of truth.

## Real-time data flow (verified)

```
                    ┌───────────────────────┐
Landing Page (web) ─│                       │
Admin Portal (web) ─│  api.amass.africa     │─── MongoDB `amass_production`
Mobile App (Expo) ──│  (FastAPI /api/*)     │───   ├─ users
                    └───────────────────────┘       ├─ properties
                                                    ├─ marketplace
                                                    ├─ wallets
                                                    ├─ property_unlocks
                                                    ├─ token_transactions
                                                    ├─ agent_applications
                                                    ├─ favorites
                                                    ├─ orders
                                                    ├─ property_events
                                                    ├─ payment_intents
                                                    ├─ payment_ledger
                                                    ├─ subscriptions
                                                    ├─ notifications
                                                    ├─ saved_searches
                                                    ├─ fixa_bookings
                                                    ├─ inspections
                                                    ├─ finance_applications
                                                    ├─ projects
                                                    ├─ ads / advertisements
                                                    └─ audit_log
```

## Sync guarantees

| Flow | Trigger | Consumed by | Latency |
|---|---|---|---|
| Property created (mobile) | `POST /api/properties` | Admin list, Landing search, Mobile home | Immediate |
| Property approved (admin) | `POST /api/admin/properties/:id/approve` | `verified=true` visible everywhere on next fetch | <1s |
| Favorite toggle (any) | `POST /api/favorites/toggle` | Same user's dashboard on all clients | Immediate |
| Wallet transaction | `WalletService.credit/debit` | Balance + tx history on any client | Immediate |
| Marketplace item posted | `POST /api/marketplace/items` (v2) | Public grid, admin panel, mobile app | Immediate |
| Order/payment fulfilled | Paystack/Flutterwave webhook → `_fulfill` | `payment_ledger` + wallet credit | <5s from webhook |
| Agent decision | `POST /api/admin/agents/:id/decision` | Public agent page, mobile profile | Immediate |
| Property view | `POST /api/properties/:id/view` | Aggregated analytics in admin & agent dashboards | Batched daily |

## Client-side cache policy
- React Query `staleTime: 60_000` prevents thundering herd but stale on-screen data recovers within 60s.
- Detail views (`PropertyDetail`) re-fetch on route entry, so approvals reflect immediately when a user opens a listing.

## Session sync
- JWT is stored in `localStorage` on web, `expo-secure-store` on mobile.
- Same `JWT_SECRET` server-side — a token issued by mobile is accepted by web and vice versa.

