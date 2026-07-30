# AMASS Ecosystem — Integration Guide

The **Admin Portal is the single source of truth**. The Landing Page and Mobile App
read/write the same data through public endpoints on this backend, so any change made
in the Admin Portal (content, listings, marketplace, config, tokens, announcements)
appears live for real users — no redeploy.

Backend base (this project): `https://amass-control.preview.emergentagent.com`
All routes are under `/api`. Public endpoints below need **no authentication**.

## 1. Drop in the client
Copy `integrations/amassClient.js` into the Landing Page and Mobile App projects and set the base URL:
- Landing (CRA): `REACT_APP_AMASS_API_BASE=https://amass-control.preview.emergentagent.com`
- Mobile (Expo): `EXPO_PUBLIC_AMASS_API_BASE=https://amass-control.preview.emergentagent.com`

```js
import { amass, mediaUrl } from "./amassClient";
const boot = await amass.bootstrap();   // one call for a homepage / app launch
```

## 2. Public endpoints (consume these)
| Purpose | Endpoint |
|---|---|
| One-shot launch payload | `GET /api/public/bootstrap` |
| Landing CMS content | `GET /api/public/landing` |
| Mobile app config | `GET /api/public/app-config` |
| Property listings (approved) | `GET /api/public/properties` (filters: city, type, listing, min_price, max_price, bedrooms, search) |
| Single property | `GET /api/public/properties/{id}` |
| Submit a listing (→ pending approval) | `POST /api/public/properties` |
| Verified agents | `GET /api/public/agents` |
| Marketplace categories (active) | `GET /api/public/marketplace/categories` |
| Marketplace products (active) | `GET /api/public/marketplace/products` (`?featured=true`) |
| Token bundles / plans | `GET /api/public/tokens/bundles`, `/plans` |
| In-app announcements | `GET /api/public/announcements` |
| Submit any form/lead | `POST /api/public/leads` (types: agent, contact, demo, partner, property, newsletter, waitlist) |

## 3. Real-time behaviour
Sync is **poll-based** (best for low-bandwidth networks). Recommended cadence:
- Landing content / app config: fetch on load + revalidate every few minutes.
- Listings / marketplace: fetch on screen open + pull-to-refresh.
- Announcements: poll every 60–120s (or on app foreground).
Because everything reads one DB, an Admin approval/edit is visible on the next fetch — no deploy.

## 4. Media
Image/video URLs returned by the API are relative (e.g. `/api/media/file/...`).
Use `mediaUrl(url)` from the client to resolve them against the backend origin.

## 5. Notes / not-yet-wired
- **End-user auth** (Google/Apple/Phone OTP) is not built yet — public reads are open; writes that need identity should be added when auth lands.
- **Push/Email/SMS** broadcasts are stored and marked *queued*; only **in-app** announcements deliver today (via `/public/announcements`). Connect a provider (Resend/FCM/Twilio) to activate the others.
- CORS is open (`*`) so both projects can call these endpoints from their own domains.
