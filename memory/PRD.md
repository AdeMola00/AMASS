# AMASS Partner (Agent) App — PRD

## Original problem statement
Study the existing AMASS app (https://github.com/AdeMola00/AMASS) — design, features, branding, journeys — then design and build a separate, beautiful AMASS Agent App that works seamlessly with it. One place for property agents, brands & sellers, and FIXA service providers to create/manage listings, respond to enquiries, handle bookings/orders, update job status and view activity. Visually consistent with AMASS with a clear partner identity. Designed for illiterate/semi-literate users: simple screens, familiar icons, large touch targets, clear visual steps, minimal reading, optional voice guidance. Each provider type sees only their tools.

## User choices
- Same accounts & data as AMASS (AMASS FastAPI backend copied into /app/backend; same Mongo collections)
- Email + password login (one form; tries AMASS user login, then AMASS brand-portal login)
- Voice guidance: phone built-in voice (expo-speech)
- Languages: English, Nigerian Pidgin, Yoruba, Hausa, Igbo (non-English copy needs native-speaker review)

## Architecture
- Backend: AMASS backend + new `backend/partner_app.py` (`/api/partner/me` roles+counts+listing quota, `/roles`, `/upload` image-only, `/fixa/jobs/{id}/stage`), idempotent demo seed.
- Frontend (Expo Router): login, welcome (pick work types), tabs Home / Work / Messages / Me, listing wizard + detail, item wizard + detail, FIXA job detail stepper, brand product edit, FIXA join, chat thread with quick replies.
- Shared: `src/ui.tsx` (Tiles, BigButton, StatusPill colour+icon, Segments, Sheet, Toast, Listen button), `src/settings.tsx` (lang + voice), `src/i18n.ts`, `src/auth.tsx`, `src/Wizard.tsx`, `src/photos.tsx` (camera permission flow, base64 upload).

## Implemented (Nov 2026)
- Role-aware Home with big count tiles; role switcher for multi-role users; agent/seller/FIXA/brand work views
- Agent: listings, status Open/Sold/Hide, leads, visit accept/another time/decline, 7-step Add-a-home wizard with listing-limit guard
- Seller: items (pause/sold/live), offers accept/counter/decline, 5-step sell wizard
- FIXA: new/accepted/finished jobs, accept/decline, On my way → Working → Finished (customer notified)
- Brand: product list, add/edit, stock, hide
- Messages (chats + alerts), chat with quick replies, long-press to hear
- Me: 5 languages, voice on/off, auto-read screens, work types, sign out
- Tested: iteration_1 & iteration_2 all pass

## Backlog
- P1: Voice notes in chat; customer-side FIXA rating prompt from partner app; brand order handoffs view
- P1: Edit listing price/photos after publishing
- P2: Earnings/activity charts; offline drafts for wizards; agent viewing hours editor
- P2: Native-speaker review of Pidgin/Yoruba/Hausa/Igbo strings
