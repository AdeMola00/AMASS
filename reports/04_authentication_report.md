# 04 — Authentication Report

## Design
- **JWT + bcrypt** — self-managed for portability and to work identically across web and mobile.
- Same `JWT_SECRET` on the single backend means a token issued on web is honored on mobile.
- Optional **Apple Sign-in** (`/api/auth/apple`) already implemented; requires only Apple developer keys.

## Single source of truth
- Collection: `db.users` (unified)
- Password: `bcrypt.hashpw(pw, gensalt())` (12 rounds)
- Token: HS256, 30-day expiry, `sub=user_id`, `iat`, `exp`
- Header: `Authorization: Bearer <token>` (validated via `HTTPBearer`)

## Roles
| Role | Flag | Set by |
|---|---|---|
| Customer | (default) | Register endpoint |
| Agent | `is_agent=true` | On successful `POST /api/agents/apply` OR admin toggle |
| Admin | `is_admin=true` OR email in `ADMIN_EMAILS` | Admin console (`PATCH /api/admin/users/:id/role`) |

Admin gating (in `admin.py`):
```py
async def _is_admin(user):
    if user.get("is_admin"): return True
    if user.get("email","").lower() in ADMIN_EMAILS: return True
    return False
```

Default admin emails (bootstrap): `admin@amass.africa`, `demo@amass.africa`.

## Password reset & session mgmt
- **Password reset:** not yet implemented in the imported codebase. **Follow-up:** add `/api/auth/forgot` + `/api/auth/reset` using Resend for delivery.
- **Sessions:** stateless JWT; sign-out is client-side (`localStorage.removeItem`). For strict invalidation, add a `token_version` bump on user record and include in payload.

## Findings
| # | Finding | Severity | Fix |
|---|---|---|---|
| A1 | No password reset flow | Medium | Add reset endpoints (Resend email + reset token in DB, 15 min TTL) |
| A2 | `JWT_SECRET` defaults to dev fallback if env missing | Medium | `.env` now sets a strong secret; enforce fail-fast when missing in prod |
| A3 | No refresh token rotation | Low | 30d access-token is acceptable for MVP; add refresh if session security tightens |
| A4 | No brute-force protection on `/api/auth/login` | High | Add IP-based rate limit + optional lockout after 8 failed attempts |
| A5 | No email verification | Medium | Add on-signup verification via Resend + `email_verified` flag |

**A1, A4, A5 are P1 for public launch.**

## Cross-surface parity
- ✅ Same `users` collection
- ✅ Same JWT verifier (`get_current_user` in `server.py`)
- ✅ Mobile app's `src/contexts/auth.tsx` and web's `src/lib/auth.jsx` speak identical shape (`{access_token, user}`)

