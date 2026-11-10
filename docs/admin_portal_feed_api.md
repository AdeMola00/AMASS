# AMASS Admin Portal — Feed moderation API

Base: `https://<api-host>/api/portal` · Auth: `X-AMASS-Portal-Key: amass_pk_…` (or `Authorization: Bearer <staff token>` from `POST /api/portal/auth/login`).
Permission module: **`feed`** (`view` for reads, `edit` for decisions). Roles: super_admin/admin + content_manager = full; customer_support + marketing = view only.
Machine-readable copy of this list: `GET /api/portal/feed/schema`.

## How moderation works in the app
1. Every new or edited post is screened by AI (text + first photo) within seconds. Verdict stored at `post.moderation`:
   `{status: clear|review|flagged|appealed|removed, score 0–1, labels[], summary, checked_at, model, ai_checked, decided_by?, decided_at?, decision_note?}`.
2. **`flagged`** → the post is hidden (`status=hidden_review`) until a moderator approves or removes it. The author is notified and can appeal from *My posts*.
3. **`review`** → the post stays live, but its AI confidence is above `settings.review_score`; it's queued for a human glance.
4. Members can **report** live posts (`reported` queue). Authors can **appeal** a flag/removal (`appealed` queue).
5. Each decision notifies the author; `remove` adds a **strike** to the author's creator profile. Strikes/suspension are visible on every queue item (`author.strikes`, `author.suspended`).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/feed/overview` | KPIs: `posts_live, posts_7d, flagged, review, appeals, reports_open, stories_live, reactions_7d, comments_7d, follows_7d, sponsored_live, verified_creators, suspended, settings` |
| GET | `/feed/queue?status=flagged\|review\|appealed\|reported\|sponsored\|removed` | `{items: AdminPost[], count}` |
| GET | `/feed/posts/{id}` | AdminPost + `report_list[]`, `recent_comments[]`, `audit[]` |
| POST | `/feed/posts/{id}/decide` | `{action: "approve"\|"remove"\|"hide", note?}` → `{ok, status, moderation_status}` |
| POST | `/feed/posts/{id}/rescreen` | Re-run the AI check → `{ok, moderation}` |
| POST | `/feed/posts/{id}/sponsored` | `{sponsored: bool, note?}` |
| GET | `/feed/reports?status=open\|resolved` | Member reports (reporter + author hydrated) |
| GET | `/feed/appeals?status=open\|accepted\|rejected` | Appeals with the post excerpt + AI summary/labels |
| GET | `/feed/users?q=&only=verified\|suspended` | Creators: handle, followers, posts, strikes, flags |
| POST | `/feed/users/{id}/action` | `{action: "verify"\|"unverify"\|"warn"\|"suspend"\|"restore"\|"clear_strikes", note?}` |
| GET | `/feed/settings` · PUT `/feed/settings` | `discovery_every` (FIXA Pros / Brands columns alternate after N posts, default 8), `homes_every` (20), `story_expiry_hours` (24), `ai_moderation`, `review_score` (0.5), `max_posts_per_day`, `max_comments_per_hour`, `sponsored_per_page` |
| GET | `/feed/audit?limit=` | Every AI verdict + moderator action, newest first (`actor` = staff or "AI screen") |

### AdminPost (queue item)
```json
{
  "id": "…", "type": "sale", "type_label": "For sale", "title": "…", "body": "…", "photos": ["/api/public-files/…"], "videos": [],
  "price": 250000, "status": "hidden_review", "sponsored": false, "location_label": "Lagos", "created_at": "2026-06-10T12:40:11+00:00",
  "moderation": {"status": "flagged", "score": 0.99, "labels": ["prohibited_item", "violence"], "summary": "Sale post offers an unregistered pistol…", "checked_at": "…", "ai_checked": true, "decision_note": null},
  "reports": 0,
  "appeal": null,
  "author": {"id": "…", "full_name": "Ada Demo", "avatar_url": null, "verified": false, "is_business": false, "strikes": 1, "suspended": false}
}
```

### Decision semantics
- `approve` — publishes a hidden/removed post (`status=active`, `moderation.status=clear`), resolves open reports, accepts an open appeal, notifies the author.
- `remove` — `status=removed`, `+1 strike`, rejects an open appeal, notifies the author with your `note` ("You can appeal from My posts").
- `hide` — pulls a live post into `hidden_review` pending a closer look.
- `warn` (user action) — `+1 strike` and a notice; nothing hidden.
- `suspend` — pauses every live post by the author (`paused_by_admin`) and blocks new posts until `restore`.

### Suggested portal pages
1. **Feed → Queue**: tabs Flagged / Review / Appeals / Reported / Removed, each card showing the AI verdict (score, labels, summary), reports, appeal text, author strikes; buttons Approve · Remove (with note) · ⋯ Warn / Suspend / Verify / Re-run AI / Sponsored.
2. **Feed → Creators**: searchable list with verify / suspend / restore.
3. **Feed → Settings**: AI toggle + threshold, discovery/homes interval, story expiry, rate limits.
4. **Feed → Audit**: timeline.

The same functions power the in-app admin screen (`/social/moderation`, `is_admin` members) under `/api/feed/admin/*`, so both surfaces always agree.
