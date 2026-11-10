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

## Iteration 3 (Jun 2026)
- Edit listing: PATCH /api/partner/listings/{id} (price + photos, price_history); screen /listing/edit/[id] with ±5/10% buttons
- Share on WhatsApp: listing detail button + round button on Work>Homes cards (uses /api/share/property/{id})
- Weekly summary: GET /api/partner/summary; dark "This week" card on Home (agent/seller/FIXA) with Listen
- Voice notes NOT built: workspace install guard blocks adding expo-audio while expo-speech is installed; needs user decision (switch voice guidance to AI voice via OpenAI TTS, which unblocks expo-audio)

## Iteration 4 (Jun 2026)
- Google login: "Continue with Google" on login screen (Emergent-managed), backend /api/auth/google-session (existing AMASS bridge) returns the same JWT; links to existing accounts by email; failed return shows a message. Tested iteration_4 (real Google sign-in needs a manual check).

## Iteration 5–6 (Jun 2026)
- Voice guidance switched to natural AI voice: OpenAI TTS (tts-1-hd, coral, 0.9 speed) via Emergent key, cached per phrase in object storage; /api/partner/tts (signed-in) and /tts-public (login screen, rate-limited). expo-speech removed, expo-audio single module player.
- Voice notes in chat: tap red mic → timer → Send/Cancel; public audio upload /api/partner/chat/{id}/voice; playable voice bubbles (also AMASS-sent notes).
- Profile photo: Me tab camera badge + button → /api/partner/avatar (also updates market seller_avatar & listing agent_avatar).
- Market item WhatsApp share: item cards + item detail; /api/partner/share/item/{id}; public page /api/partner/go/item/{id} with store links and seller WhatsApp fallback.
- Known: notes recorded on web are webm (may not play on iPhone); no native-accent voices for Yoruba/Hausa/Igbo (OpenAI voices are English-trained).

## Iteration 7 (Jun 2026)
- Verified face badge: /api/partner/avatar runs an AI photo check (OpenAI gpt-5.4 vision, Emergent key) for one clear real face → users.face_verified, seller_face_verified, agent_face_verified, FIXA badge "Verified face"; checker errors keep previous state (503), 10 tries/hour. Me tab badge + hint.
- Share stats: /api/partner/share-stats (property smart_link_clicks + item share_clicks, bots excluded); shown on home/item cards and detail screens.
- Native voices: Spitch TTS (yo=sade, ha=amina, ig=ngozi) used when SPITCH_API_KEY is set; otherwise OpenAI fallback. Key requested from user.
- Known: the badge shows a face is present, not that it matches the account holder.

## Iteration 8–9 (Jun 2026)
- Offline drafts: new listing + new item wizards auto-save answers and step on the phone (key draft_listing_<userId> / draft_item_<userId>), restore with banner + Start over, home "Unfinished listing/item" notice (hidden at listing limit), cleared on publish. Network failure on publish keeps the draft.
- Offline photos: wizard photos taken without signal stay on the phone (native documents folder; web data URL) with a cloud badge, uploaded on publish (progress saved, local file deleted).
- Earnings charts: GET /api/partner/trends (8 rolling weeks per role) + /progress screen with bar charts, opened from the WeekCard "See my last 8 weeks" button.

## Iteration 10 (Jun 2026)
- FIXA job prices: POST /api/partner/fixa/jobs/{id}/paid {amount} (only finished/completed jobs; first paid_at kept on corrections). Job detail "How much did the customer pay?" card. Week card FIXA metrics: jobs_done, money_earned, rating; trends adds money_earned chart.
- Viewing hours editor: /viewing-hours screen (7 day switches, From/To steppers in 30 min, presets, visit length 30/45/60/90) → PUT /api/viewings/availability/me. Entry: Work → Visits header card.
- Edit from review: listing + item wizard review rows are tappable (pencil) → jump to that question, Next says "Done, back to check".

## Backlog
- P1: Voice notes in chat; customer-side FIXA rating prompt from partner app; brand order handoffs view
- P1: Edit listing price/photos after publishing
- P2: Earnings/activity charts; offline drafts for wizards; agent viewing hours editor
- P2: Native-speaker review of Pidgin/Yoruba/Hausa/Igbo strings
