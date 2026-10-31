# AMASS Admin Portal — Market API contract

Everything the external **AMASS Admin** dashboard (amass-control.emergent.host) needs to manage the
**Market** tab of the AMASS app. Live, machine-readable copy: `GET /api/portal/market/schema`.

- **Base URL**: `https://<app-domain>/api/portal` (the live app's domain, e.g. `property-os-africa.emergent.host`).
- **Auth**: `X-AMASS-Portal-Key: amass_pk_…` (or `Authorization: Bearer amass_pk_…`) — the key generated in the
  app under *Admin → Admin Portal connection* **on the same environment**. Optional
  `X-AMASS-Portal-Actor: Name <email>` names the staff member in the audit log.
  Staff accounts that sign in with `POST /auth/login` get the same routes, gated by their role.
- **Permissions**: the `brands` module gates brands / logins / products / offers / images / banners / featured
  placement; the existing `marketplace` module gates FIXA and Declutter moderation. Super Admin, Administrator,
  Content Manager have both in full; Marketing has view/create/edit; other roles can be granted them on the Roles page.
- **Removing hides** (restorable) — brands, products and banners are never hard-deleted. The only hard delete is a
  brand *login* (`DELETE …/accounts/{aid}`).
- **Money**: integer NGN. **Dates**: ISO-8601; schedule fields accept `2026-07-01T00:00:00Z`.
- Every write is recorded in the portal audit log and surfaces under Dashboard → Recent activities.

## Overview
| Method | Path | Notes |
|---|---|---|
| GET | `/market/overview` | counts for brands, products, offers, featured, banners, FIXA, Declutter |
| GET | `/market/categories` | the six Market categories `{key,label,icon,color}` |
| GET | `/market/schema` | this contract, grouped |

## Brands (`shop_retailers`) — `brands`
| Method | Path | Body / query |
|---|---|---|
| GET | `/market/brands` | `search`, `status=all\|visible\|hidden`, `sponsored=true\|false` → `{items, count}` |
| POST | `/market/brands` | `{name*, tagline, logo_url, categories[], website, phone, whatsapp, email, accent, published}` → 201 (409 duplicate name) |
| GET | `/market/brands/{id}` | brand + `accounts[]` + `products[]` |
| PATCH | `/market/brands/{id}` | any of the create fields + `published`, `sponsored` |
| DELETE | `/market/brands/{id}` | hide from the Market (`published=false`, `hidden_at`) — its products disappear from the app too; nothing is deleted |
| POST | `/market/brands/{id}/restore` | show again |
| PATCH | `/market/brands/{id}/featured` | `{featured}` → pins the brand to the top of store rows |
| POST | `/market/brands/{id}/logo` | multipart `file` (JPEG/PNG/WebP/GIF/AVIF ≤ 8 MB) → sets `logo_url` |

Brand row: `{id, slug, name, tagline, logo_url, accent, categories[], website, phone, whatsapp, email, published,
sponsored, managed, product_count, in_stock_count, deal_count, hidden_at, source, created_at, accounts[]}`.

## Brand logins (`brand_accounts`) — `brands`
| Method | Path | Body |
|---|---|---|
| GET | `/market/brands/{id}/accounts` | |
| POST | `/market/brands/{id}/accounts` | `{name*, email*}` → 201; emails a set-password invite (72 h). `email_sent=false` ⇒ `invite_link` is returned once so you can pass it on |
| POST | `/market/brands/{id}/accounts/{aid}/invite` | re-send (becomes a reset link once a password exists) |
| PATCH | `/market/brands/{id}/accounts/{aid}` | `{disabled}` |
| DELETE | `/market/brands/{id}/accounts/{aid}` | delete the login |

Account row: `{id, name, email, brand_id, disabled, password_set, invite_sent_at, invite_expires_at, invite_kind,
invite_error, last_login_at, created_at}`.

## Products (`shop_products`) — `brands`
| Method | Path | Body / query |
|---|---|---|
| GET | `/market/products` | `brand_id`, `search`, `status=all\|visible\|hidden`, `category`, `offers=true`, `featured=true`, `limit` |
| POST | `/market/brands/{id}/products` | `{name*, description, category*, price*, images[], stock_status in_stock\|out_of_stock\|preorder, published, featured, offer?}` → 201 |
| GET | `/market/products/{pid}` | |
| PATCH | `/market/products/{pid}` | `{name, description, category, price, images[] (replaces — reorder/remove), stock_status, published, featured}` — raising `price` to ≥ the offer's previous price clears the offer |
| DELETE | `/market/products/{pid}` | hide |
| POST | `/market/products/{pid}/restore` | show again |
| PATCH | `/market/products/{pid}/featured` | `{featured}` |
| POST | `/market/products/{pid}/images` | multipart `file` → appends, returns the product + `upload{url,path}` |
| DELETE | `/market/products/{pid}/images?url=` | remove one image |

Product row: `{id, name, title, description, category, category_name, brand_id, brand_name, price, images[],
stock, stock_status, featured, status active\|hidden, published, removed_at, offer, source, views, saves,
basket_adds, created_at, updated_at}`.

## Offers (price drops) — `brands`
| Method | Path | Body / query |
|---|---|---|
| GET | `/market/offers` | `status=live\|expired\|all`, `brand_id` |
| PUT | `/market/products/{pid}/offer` | `{previous_price*, label, terms, expires_at, source_url}` — `previous_price` must beat the current price (400 otherwise); past `expires_at` → 400 |
| DELETE | `/market/products/{pid}/offer` | end the offer |

Offer view: `{label, previous_price, price, saving, percent_off, terms, expires_at, source_url, verified_at,
status live\|expired\|hidden}` (`hidden` = the product itself is hidden; `GET /market/offers?status=hidden`). If `terms` is omitted the app shows "Offer listed by AMASS Admin on <date> · ends <date>"
or "· no end date published" — the shop's data-honesty rule.

## Featured placement — `brands`
`GET /market/featured` → `{brands[], products[]}`; set with the two `…/featured` PATCHes above.

## Market home banners (`shop_banners`) — `brands`
| Method | Path | Body / query |
|---|---|---|
| GET | `/market/banners` | `include_archived=true` |
| GET | `/market/banners/preview` | exactly what the app renders right now |
| POST | `/market/banners` | `{title*, body, cta, route, tone brand\|info\|warning\|success, image, order, active, starts_at, ends_at}` |
| PATCH | `/market/banners/{id}` | same fields; `clear_schedule=true` removes the window |
| DELETE | `/market/banners/{id}` | archive |
| POST | `/market/banners/{id}/restore` | un-archive and switch back on |

`route` must be an in-app path (`/shop/store/<slug>`, `/shop/category/lighting?deals=1`, `/shop/product/<id>`) or an
`https://` link (opens in the in-app browser) — anything else is rejected with 422. An `ends_at` in the past is rejected. Banners show at the top of Market → Brands, ordered by `order`,
ahead of the automatic "price drops" / "My Home" cards. `live` = active, not archived, inside the schedule.

## Images — `brands`
`POST /market/upload?folder=market` multipart `file` → `{id, url, path, bytes, content_type, name}`; use the `url`
in `images[]`, `logo_url` or a banner `image`. Files are checked by content (JPEG/PNG/GIF/WebP/AVIF signatures), not just
by the declared type — anything else is 415.

## FIXA service providers — `marketplace`
| Method | Path | Body / query |
|---|---|---|
| GET | `/market/fixa/overview` | `{pending, verified, hidden, open_reports}` |
| GET | `/market/fixa/providers` | `status=pending\|verified\|rejected\|suspended\|hidden\|all` |
| POST | `/market/fixa/providers/{id}/approve` | `{note}` — verifies + notifies the provider |
| POST | `/market/fixa/providers/{id}/reject` | `{note}` |
| POST | `/market/fixa/providers/{id}/suspend` | `{note}` |
| POST | `/market/fixa/providers/{id}/reinstate` | |
| GET | `/market/fixa/reports` | `status=open\|resolved\|dismissed\|all` |
| POST | `/market/fixa/reports/{id}/resolve` | `{outcome resolved\|dismissed, note, reinstate}` |

## Declutter classifieds — `marketplace`
| Method | Path | Body / query |
|---|---|---|
| GET | `/market/declutter/listings` | `status=active\|paused\|sold\|removed\|all`, `q`, `seller_id`, `limit` → rows carry `open_reports` |
| PATCH | `/market/declutter/listings/{id}` | `{action pause_listing\|restore_listing\|remove_listing, note}` (seller is notified; remove also closes open reports) |
| GET | `/market/declutter/reports` | `status=OPEN\|RESOLVED\|ALL` |
| POST | `/market/declutter/reports/{id}/resolve` | `{action dismiss\|remove_listing\|pause_listing\|restore_listing, note}` — resolves every open report on that listing |

## Errors
`401` no/invalid key (message names the API host that rejected it — keys are per environment), `403` role lacks the
action, `404` unknown id, `400` rule broken (offer price, schedule, category), `409` duplicate brand / login email,
`413` image too large, `415` not an image.
