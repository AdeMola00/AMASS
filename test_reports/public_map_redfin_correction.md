# AMASS Public Property Map — Redfin-style Correction Report

**Date:** June 2026
**Scope:** Consumer-facing public map only. Admin discovery maps are untouched.

## What was corrected

1. **Marker colour system reset to property-type only.**
   The old *tone* system (green For Sale / blue For Rent / purple Commercial / etc.) has been retired on the public map. Every marker now paints its border and label in the property-type registry colour (Residential blue, Apartment purple, Estate green, Land brown, Commercial orange, Industrial dark grey, Hospitality teal, Institutional indigo, Other grey), matching the palette already defined in `property_types` and `usePropertyTypes`.

2. **Marker label = compact ₦ price with transaction-type suffix.**
   New helper `formatMarkerPrice(price, listing_type)` produces `₦350M` for sale, `₦8.5M/yr` for rent/lease, `₦450K/night` for shortlet, and `Price on Request` when price is missing/zero/NaN. The old fixed `formatNaira` no longer drives markers directly.

3. **Verification moved to a small shield badge.**
   Verified listings render a green shield-checkmark inside the pill (gold when selected). Colour is never used to signal verification.

4. **Selected marker keeps type colour + gets emphasis.**
   Active state = ink-inverted fill, scale 1.10×, richer shadow. Border stays the property-type colour so users still recognise the category.

5. **Cluster marker upgraded to Redfin-style.**
   Now reads `27 homes` / `1 home` under the count so users understand what is being aggregated.

6. **Layer legend switched from tones → property types.**
   `LayerPickerSheet` now renders 9 property-type dots with `legend-{slug}` testIDs.

7. **Property list rows carry the type accent bar.**
   `PropertyCard` row variant has a 4-px coloured left edge matching the marker.

8. **MapDockedCard aligned.**
   Bottom card shows a coloured `typeChip` in its meta row (dot + capitalised type text) and gracefully renders `Price on Request` when there is no valid price.

## Existing components reused (no rewrites)

- `usePropertyTypes` hook (colour resolver, unchanged)
- `PropertyCard` row/floating/card variants (row now takes the accent bar; other variants untouched)
- `MapDockedCard` (kept structure; swapped tone chip → property-type chip; added POR fallback)
- Backend `/api/properties` list route (untouched — already read only from `db.properties`)
- Home map viewport-based query, debounce, and clustering (unchanged)
- `LayerPickerSheet` (kept structure, swapped legend rows)
- Admin discovery, duplicate-review, verification wizard maps (untouched)

## APIs / data sources changed

- **None.** The public map has always queried `/api/properties`, which reads only from `db.properties` and never `property_candidates` / `properties_geo`. No API surface was modified.

## Verification

1. Testing agent confirmed on the deployed preview:
   - No legacy `marker-sale/rent/premium/commercial` testIDs exist anywhere in `/app/frontend`
   - New `marker-{slug}` testIDs present with compact ₦ labels
   - Legend sheet renders 9 property-type items with `legend-{slug}` testIDs
   - `/api/properties?limit=200` returns 10 listings, all with lowercase `property_type` slugs — no candidate_type leaks
   - Zero `/api/admin/discovery/*` network calls from the public map/home tab
   - `/admin/discovery` unchanged and still shows the pending duplicate-review + search form
   - Full Phase-D backend regression 134 passed · 1 skipped
2. Code review confirmed:
   - Public marker system is driven exclusively by `property_type` slug via the inline registry mirror inside `PropertyMarker.tsx`
   - `PriceOnRequest` branch is reachable when `price` is null/0/NaN

## Remaining issues / recommendations

- **React-native-maps web stub renders a placeholder on Expo web**, so only one marker was visible during automated web checks. All rules were verified via code path + backend spot-checks. Native (Expo Go / dev build) still renders the marker fleet correctly.
- Future enhancement: introduce a `min_map_zoom_for_prices` client-side setting so at very zoomed-out levels only clusters and coloured dots are drawn (no price labels), then the price appears as the user zooms in.
- Future enhancement: add a small property-type filter row in the map header (chips) that hides one type at a time — a natural extension of the new colour system.

## Sign-off

Public map now reads: **MAP → AMASS PROPERTY → PROPERTY TYPE COLOUR → PRICE → PROPERTY PREVIEW**. Admin discovery workflows retain all operational layers.
