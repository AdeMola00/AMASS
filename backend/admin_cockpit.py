"""AMASS Admin Cockpit — Phase 6D

Admin-only endpoints for:
  • Duplicate queue — properties awaiting admin review (agent overrode a
    high-confidence duplicate, OR properties with nearby geospatial neighbours)
  • Merge — collapse two AMASS IDs into one canonical (loser's id joins
    `aliases[]`, listings/reps re-linked, immutable audit trail written)
  • Audit log stream — filterable, paginated
  • Property verification — mark PROPERTY_VERIFIED
  • Passport visibility bulk view

Data model rules honoured:
  • The AMASS Property ID belongs to the physical property — after merge
    the winner keeps its ID; the loser's ID is preserved via aliases[] so
    QR codes and passport URLs KEEP RESOLVING to the canonical page.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel


class MergeIn(BaseModel):
    winner_amass_id: str
    loser_amass_id: str
    reason: Optional[str] = None


class VerifyIn(BaseModel):
    action: Literal["verify", "unverify"] = "verify"
    reason: Optional[str] = None


class ReviewDecisionIn(BaseModel):
    action: Literal["clear", "flag_for_merge"]
    reason: Optional[str] = None
    merge_with_amass_id: Optional[str] = None


async def _audit(db, property_id, actor, action, new=None, old=None, reason=None):
    await db.property_audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "property_id": property_id,
        "actor_id": (actor or {}).get("id"),
        "actor_type": "admin" if (actor or {}).get("is_admin") else "agent",
        "action": action,
        "old_value": old,
        "new_value": new,
        "reason": reason,
        "created_at": datetime.now(timezone.utc),
    })


def register_admin_cockpit_routes(db, require_admin):
    router = APIRouter(prefix="/api/admin/cockpit", tags=["admin-cockpit"])

    # ───────────────────────── DASHBOARD ─────────────────────────
    @router.get("/dashboard")
    async def cockpit_dashboard(_admin=Depends(require_admin)):
        """Counts for the admin landing page tiles."""
        pending_dup = await db.properties_geo.count_documents({"needs_admin_review": True})
        pending_reps = await db.property_representations.count_documents({"status": "PENDING"})
        docs_requested = await db.property_representations.count_documents({"status": "DOCS_REQUESTED"})
        total_props = await db.properties_geo.count_documents({})
        total_listings = await db.property_listings.count_documents({})
        merged = await db.properties_geo.count_documents({"physical_status": "MERGED"})
        pending_estates = await db.estates.count_documents({"status": "pending"})
        open_social_reports = await db.social_reports.count_documents({"status": "OPEN"})
        kyc_identity_pending = await db.identity_verifications.count_documents({"status": "pending"})
        kyc_documents_pending = await db.property_documents.count_documents({"status": "pending"})
        return {
            "pending_duplicate_review": pending_dup,
            "pending_representations": pending_reps,
            "docs_requested": docs_requested,
            "total_properties": total_props,
            "total_listings": total_listings,
            "merged_properties": merged,
            "pending_estates": pending_estates,
            "open_social_reports": open_social_reports,
            "kyc_identity_pending": kyc_identity_pending,
            "kyc_documents_pending": kyc_documents_pending,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    # ──────────────────────── DUPLICATE QUEUE ────────────────────
    @router.get("/duplicate-queue")
    async def duplicate_queue(
        limit: int = Query(50, ge=1, le=200),
        _admin=Depends(require_admin),
    ):
        """Two buckets:
          1) Explicitly flagged: needs_admin_review=True (agent overrode high-conf)
          2) Nearby siblings within 25m of another property (recomputed live)
        """
        # Bucket 1: flagged
        flagged = await db.properties_geo.find(
            {"needs_admin_review": True, "physical_status": {"$ne": "MERGED"}},
            {"_id": 0},
        ).sort("created_at", -1).limit(limit).to_list(limit)

        # For each flagged property, compute the top 3 nearest neighbours.
        async def _neighbours(p, radius_m=30):
            neigh = await db.properties_geo.find({
                "property_uuid": {"$ne": p["property_uuid"]},
                "physical_status": {"$ne": "MERGED"},
                "entrance_point": {
                    "$near": {
                        "$geometry": p["entrance_point"],
                        "$maxDistance": radius_m,
                    }
                },
            }, {"_id": 0}).to_list(3)
            return neigh

        out = []
        for p in flagged:
            neigh = await _neighbours(p)
            out.append({
                "property": {
                    "amass_property_id": p["amass_property_id"],
                    "property_uuid": p["property_uuid"],
                    "state": p.get("state"),
                    "lga": p.get("lga"),
                    "area": p.get("area"),
                    "estate": p.get("estate"),
                    "street": p.get("street"),
                    "property_type": p.get("property_type"),
                    "created_at": p.get("created_at"),
                    "created_by": p.get("created_by"),
                    "review_reason": p.get("review_reason"),
                    "duplicate_score_at_creation": p.get("duplicate_score_at_creation"),
                    "cover": (p.get("media_ids") or [None])[0],
                },
                "candidates": [{
                    "amass_property_id": n["amass_property_id"],
                    "property_uuid": n["property_uuid"],
                    "state": n.get("state"),
                    "area": n.get("area"),
                    "street": n.get("street"),
                    "estate": n.get("estate"),
                    "property_type": n.get("property_type"),
                    "created_at": n.get("created_at"),
                    "cover": (n.get("media_ids") or [None])[0],
                } for n in neigh],
            })
        return {"items": out, "total_flagged": len(out)}

    @router.post("/duplicate-queue/{amass_id}/decide")
    async def resolve_dup_review(
        amass_id: str,
        data: ReviewDecisionIn = Body(...),
        admin: dict = Depends(require_admin),
    ):
        p = await db.properties_geo.find_one({"amass_property_id": amass_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Property not found")
        now = datetime.now(timezone.utc)
        if data.action == "clear":
            await db.properties_geo.update_one(
                {"amass_property_id": amass_id},
                {"$set": {"needs_admin_review": False,
                          "admin_review_cleared_at": now,
                          "admin_review_cleared_by": admin["id"],
                          "updated_at": now}},
            )
            await _audit(db, p["property_uuid"], admin, "DUPLICATE_REVIEW_CLEARED",
                         reason=data.reason)
            return {"ok": True, "status": "cleared"}
        # flag_for_merge just annotates; the actual merge happens via /merge
        if not data.merge_with_amass_id:
            raise HTTPException(400, "merge_with_amass_id required when action=flag_for_merge")
        await db.properties_geo.update_one(
            {"amass_property_id": amass_id},
            {"$set": {"admin_merge_hint": data.merge_with_amass_id, "updated_at": now}},
        )
        await _audit(db, p["property_uuid"], admin, "DUPLICATE_FLAGGED_FOR_MERGE",
                     new={"merge_hint": data.merge_with_amass_id}, reason=data.reason)
        return {"ok": True, "status": "flagged_for_merge"}

    # ─────────────────────────── MERGE ──────────────────────────
    @router.get("/compare")
    async def compare_properties(
        a: str = Query(..., description="AMASS ID A"),
        b: str = Query(..., description="AMASS ID B"),
        _admin=Depends(require_admin),
    ):
        pa = await db.properties_geo.find_one({"amass_property_id": a}, {"_id": 0})
        pb = await db.properties_geo.find_one({"amass_property_id": b}, {"_id": 0})
        if not pa or not pb:
            raise HTTPException(404, "One or both properties not found")
        la = await db.property_listings.count_documents({"property_id": pa["property_uuid"]})
        lb = await db.property_listings.count_documents({"property_id": pb["property_uuid"]})
        ra = await db.property_representations.count_documents({"property_id": pa["property_uuid"]})
        rb = await db.property_representations.count_documents({"property_id": pb["property_uuid"]})
        return {
            "a": {**pa, "listings_count": la, "representations_count": ra},
            "b": {**pb, "listings_count": lb, "representations_count": rb},
        }

    @router.post("/merge")
    async def merge_properties(
        data: MergeIn = Body(...),
        admin: dict = Depends(require_admin),
    ):
        if data.winner_amass_id == data.loser_amass_id:
            raise HTTPException(400, "Winner and loser must be different")
        winner = await db.properties_geo.find_one({"amass_property_id": data.winner_amass_id}, {"_id": 0})
        loser = await db.properties_geo.find_one({"amass_property_id": data.loser_amass_id}, {"_id": 0})
        if not winner:
            raise HTTPException(404, f"Winner {data.winner_amass_id} not found")
        if not loser:
            raise HTTPException(404, f"Loser {data.loser_amass_id} not found")
        if loser.get("physical_status") == "MERGED":
            raise HTTPException(400, f"{data.loser_amass_id} is already merged")

        now = datetime.now(timezone.utc)
        # ── 1) Move loser's listings to winner ───────────────
        listing_move = await db.property_listings.update_many(
            {"property_id": loser["property_uuid"]},
            {"$set": {
                "property_id": winner["property_uuid"],
                "amass_property_id": winner["amass_property_id"],
                "merged_from_amass_id": loser["amass_property_id"],
                "updated_at": now,
            }},
        )
        # ── 2) Move loser's representations to winner (avoid unique clash) ──
        rep_move = 0
        loser_reps = await db.property_representations.find(
            {"property_id": loser["property_uuid"]}, {"_id": 0}
        ).to_list(500)
        for r in loser_reps:
            # If a rep already exists on the winner for the same (listing, user)
            # skip — the listing move already re-linked the winning rep.
            existing = await db.property_representations.find_one(
                {"listing_id": r["listing_id"], "user_id": r["user_id"],
                 "property_id": winner["property_uuid"]}, {"_id": 0}
            )
            if existing:
                # Also remove the loser's dupe to keep data clean
                await db.property_representations.delete_one({"id": r["id"]})
                continue
            await db.property_representations.update_one(
                {"id": r["id"]},
                {"$set": {
                    "property_id": winner["property_uuid"],
                    "amass_property_id": winner["amass_property_id"],
                    "merged_from_amass_id": loser["amass_property_id"],
                    "updated_at": now,
                }},
            )
            rep_move += 1

        # ── 3) Stamp loser as MERGED + join alias into winner ─────
        await db.properties_geo.update_one(
            {"property_uuid": loser["property_uuid"]},
            {"$set": {
                "physical_status": "MERGED",
                "merged_into_property_uuid": winner["property_uuid"],
                "merged_into_amass_id": winner["amass_property_id"],
                "merged_at": now,
                "merged_by": admin["id"],
                "updated_at": now,
            }},
        )
        aliases = set(winner.get("aliases") or [])
        aliases.add(loser["amass_property_id"])
        for a in (loser.get("aliases") or []):
            aliases.add(a)
        await db.properties_geo.update_one(
            {"property_uuid": winner["property_uuid"]},
            {"$set": {
                "aliases": sorted(aliases),
                "has_merged_aliases": True,
                "needs_admin_review": False,
                "updated_at": now,
            }},
        )

        # ── 4) Audit (both properties) ────────────────────────
        await _audit(db, winner["property_uuid"], admin, "PROPERTY_MERGED",
                     new={"winner": winner["amass_property_id"],
                          "loser": loser["amass_property_id"],
                          "listings_moved": listing_move.modified_count,
                          "reps_moved": rep_move},
                     reason=data.reason)
        await _audit(db, loser["property_uuid"], admin, "PROPERTY_MERGED",
                     new={"merged_into": winner["amass_property_id"]}, reason=data.reason)

        return {
            "ok": True,
            "winner_amass_id": winner["amass_property_id"],
            "loser_amass_id": loser["amass_property_id"],
            "listings_moved": listing_move.modified_count,
            "reps_moved": rep_move,
            "loser_aliased_into_winner": True,
        }

    # ─────────────────────── VERIFY PROPERTY ────────────────────
    @router.post("/property/{amass_id}/verify")
    async def toggle_verify(
        amass_id: str,
        data: VerifyIn = Body(...),
        admin: dict = Depends(require_admin),
    ):
        p = await db.properties_geo.find_one({"amass_property_id": amass_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Property not found")
        new_status = "VERIFIED" if data.action == "verify" else "PENDING_REVIEW"
        now = datetime.now(timezone.utc)
        await db.properties_geo.update_one(
            {"amass_property_id": amass_id},
            {"$set": {
                "property_identity_status": new_status,
                "verified_at": now if data.action == "verify" else None,
                "verified_by": admin["id"] if data.action == "verify" else None,
                "updated_at": now,
            }},
        )
        await _audit(db, p["property_uuid"], admin,
                     "PROPERTY_VERIFIED" if data.action == "verify" else "PROPERTY_UNVERIFIED",
                     new={"status": new_status}, reason=data.reason)
        if data.action == "verify":
            from social_publishing import schedule_auto_post

            legacy = await db.properties.find_one({"migrated_to_amass_property_id": amass_id}, {"_id": 0, "id": 1})
            if legacy:
                await db.properties.update_one({"id": legacy["id"]}, {"$set": {"verified": True, "verified_at": now, "verified_by": admin["id"]}})
                schedule_auto_post(db, legacy["id"], admin)
        return {"ok": True, "status": new_status}

    # ────────────────────────── AUDIT LOG ────────────────────────
    @router.get("/audit-logs")
    async def audit_logs(
        property_id: Optional[str] = Query(None, description="property_uuid OR AMASS ID"),
        action: Optional[str] = Query(None),
        actor_type: Optional[Literal["agent", "admin"]] = Query(None),
        since: Optional[str] = Query(None, description="ISO datetime"),
        until: Optional[str] = Query(None, description="ISO datetime"),
        limit: int = Query(100, ge=1, le=500),
        cursor: Optional[str] = Query(None, description="audit log id to page from"),
        _admin=Depends(require_admin),
    ):
        q: dict = {}
        # Accept either AMASS-XXX-... or a raw property_uuid
        if property_id:
            if property_id.startswith("AMASS-"):
                p = await db.properties_geo.find_one(
                    {"$or": [{"amass_property_id": property_id}, {"aliases": property_id}]},
                    {"_id": 0, "property_uuid": 1},
                )
                if not p:
                    return {"items": [], "next_cursor": None}
                q["property_id"] = p["property_uuid"]
            else:
                q["property_id"] = property_id
        if action:
            q["action"] = action
        if actor_type:
            q["actor_type"] = actor_type
        date_q: dict = {}
        if since:
            try:
                date_q["$gte"] = datetime.fromisoformat(since.replace("Z", "+00:00"))
            except Exception:
                raise HTTPException(400, "since must be ISO datetime")
        if until:
            try:
                date_q["$lte"] = datetime.fromisoformat(until.replace("Z", "+00:00"))
            except Exception:
                raise HTTPException(400, "until must be ISO datetime")
        if date_q:
            q["created_at"] = date_q
        if cursor:
            cursor_doc = await db.property_audit_logs.find_one({"id": cursor}, {"_id": 0, "created_at": 1})
            if cursor_doc:
                q["created_at"] = {**q.get("created_at", {}), "$lt": cursor_doc["created_at"]}

        rows = await db.property_audit_logs.find(q, {"_id": 0}) \
            .sort("created_at", -1).limit(limit + 1).to_list(limit + 1)
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = rows[-1]["id"] if has_more and rows else None
        return {"items": rows, "next_cursor": next_cursor, "count": len(rows)}

    @router.get("/audit-logs/actions")
    async def audit_action_list(_admin=Depends(require_admin)):
        """Distinct action names — for the filter dropdown."""
        actions = await db.property_audit_logs.distinct("action")
        return sorted(actions)

    # ────────────────── PHASE 6E: LEGACY MIGRATION ──────────────
    @router.post("/migrate-legacy")
    async def migrate_legacy(
        dry_run: bool = Query(True, description="Preview without writing"),
        limit: Optional[int] = Query(None, ge=1, le=1000),
        _admin=Depends(require_admin),
    ):
        """Migrate legacy `properties` docs → new Property Identity model.
        Idempotent — properties already flagged `migrated_to_amass_property_id`
        are skipped. Default dry_run=True for safety."""
        from migrations.migrate_legacy_properties import run_migration
        summary = await run_migration(db, dry_run=dry_run, limit=limit)
        return summary

    @router.get("/migrate-legacy/status")
    async def migrate_status(_admin=Depends(require_admin)):
        """Quick pre-flight counts for the admin UI."""
        total_legacy = await db.properties.count_documents({})
        already = await db.properties.count_documents({"migrated_to_amass_property_id": {"$exists": True}})
        missing_gps = await db.properties.count_documents({
            "$or": [{"latitude": None}, {"longitude": None},
                    {"latitude": {"$exists": False}}, {"longitude": {"$exists": False}}],
            "migrated_to_amass_property_id": {"$exists": False},
        })
        return {
            "total_legacy": total_legacy,
            "already_migrated": already,
            "pending": total_legacy - already,
            "missing_gps": missing_gps,
        }

    return router
