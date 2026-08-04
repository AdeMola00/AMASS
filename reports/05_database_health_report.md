# 05 — Database Health Report

## Engine
MongoDB (`motor` async driver). Single logical DB `amass_production` for prod, `test_database` for dev.

## Collections (unified)

| Collection | Purpose | Key fields | Indexes recommended |
|---|---|---|---|
| `users` | All users (customer/agent/admin) | `id`, `email` unique, `is_agent`, `is_admin` | `email` (unique), `id` |
| `properties` | Property listings | `id`, `agent_id`, `city`, `verified`, `latitude`, `longitude` | `id` unique, `agent_id`, geo 2dsphere, `verified` |
| `favorites` | user↔property favorites | `user_id`, `property_id` | compound `(user_id, property_id)` unique |
| `property_events` | view/favorite analytics | `property_id`, `event_type`, `user_id`, `created_at` | `(property_id, event_type, created_at)` |
| `property_unlocks` | Token-gated unlocks | `user_id`, `property_id`, `expires_at` | compound `(user_id, property_id, expires_at)` |
| `wallets` | MASS + FIX wallets | `user_id`, `currency` | compound `(user_id, currency)` unique |
| `token_transactions` | Wallet audit trail | `user_id`, `currency`, `kind`, `created_at`, `meta.idempotency_key` | `(user_id, currency, created_at)`, `meta.idempotency_key` |
| `subscriptions` | Monthly plans | `user_id`, `status`, `plan_id` | `(user_id, status)` |
| `marketplace` | Listings + services | `id`, `category`, `subcategory`, `city` | `id` unique, `(category, subcategory)`, text on `name` |
| `orders` | Checkout orders | `id`, `user_id` | `id` unique |
| `carts` | User carts | `user_id` | `user_id` unique |
| `payment_intents` | Payment sessions | `reference` unique, `user_id`, `status` | `reference` unique |
| `payment_ledger` | Verified payments | `reference` unique | `reference` unique |
| `agent_applications` | Agent onboarding | `user_id`, `status` | `user_id` unique, `status` |
| `notifications` | User notifications | `user_id`, `read`, `created_at` | `(user_id, created_at)` |
| `saved_searches` | Alerts on searches | `user_id` | `user_id` |
| `fixa_bookings` | FIXA service bookings | `user_id`, `provider_id`, `status` | `user_id`, `provider_id` |
| `inspections` | Property inspections | `user_id`, `property_id`, `status` | `user_id`, `property_id` |
| `finance_applications` | BNPL apps | `user_id`, `property_id` | `user_id`, `property_id` |
| `projects` | Renovation projects | `user_id`, `property_id` | `user_id`, `property_id` |
| `advertisements` | Marketplace ads | `seller_id`, `status`, `expires_at` | `(status, expires_at)` |
| `neighborhoods` | City/area data | `id`, `city` | `id` unique |
| `vendors` | Marketplace brands | `id` | `id` unique |
| `collections` | Marketplace curated | `id`, `slug` | `slug` unique |
| `audit_log` | **NEW** — Admin actions | `actor_id`, `action`, `created_at` | `(actor_id, created_at)` |
| `agent_referrals` | Agent referral commissions | `agent_id`, `status` | `agent_id` |

## Index creation (recommended startup task)

```py
async def ensure_indexes(db):
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.properties.create_index("id", unique=True)
    await db.properties.create_index([("latitude", 1), ("longitude", 1)])
    await db.properties.create_index("verified")
    await db.favorites.create_index([("user_id",1),("property_id",1)], unique=True)
    await db.wallets.create_index([("user_id",1),("currency",1)], unique=True)
    await db.token_transactions.create_index([("user_id",1),("created_at",-1)])
    await db.payment_intents.create_index("reference", unique=True)
    await db.payment_ledger.create_index("reference", unique=True)
    await db.audit_log.create_index([("actor_id",1),("created_at",-1)])
```

**Recommendation:** attach `ensure_indexes(db)` to `@app.on_event("startup")` for the production deploy.

## Relationship integrity
- Foreign keys are UUIDs (not `ObjectId`s) — cleanly JSON-serializable per Emergent MongoDB adherence rules.
- Cross-collection integrity is app-enforced (no MongoDB FKs). Cascade deletes: an admin property delete should also clean `favorites`, `property_events`, `property_unlocks`. **Currently we do not cascade — mark as follow-up.**

## Migrations
- No schema migrations needed for the merge: the imported backend already speaks the target schema. Legacy MASS wallet docs (missing `currency`) auto-migrate to `currency: "MASS"` on first read (`WalletService.get_or_create`).

## Backup strategy (production)
- `mongodump` nightly to object storage with 30-day retention.
- Point-in-time recovery available via Atlas (recommended if we move off self-hosted).

