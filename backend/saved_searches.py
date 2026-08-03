"""AMASS Saved Searches & Alerts.

Users save a filter set (query, location, price range, beds, property type…).
Later they can re-run the search or opt-in to alerts (email/push when new
matching listings appear). This module owns:

  • POST   /api/saved-searches                 — create
  • GET    /api/saved-searches                 — list current user's searches
  • DELETE /api/saved-searches/{id}            — remove
  • PATCH  /api/saved-searches/{id}/alerts     — toggle alerts on/off
  • POST   /api/saved-searches/{id}/run        — return matches (delegates to /properties)

Alerts run out-of-band: a placeholder counter (`new_matches_since_seen`) is kept
so the mobile app can badge the saved-search list. Push delivery integrates later.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase


class SavedSearchCriteria(BaseModel):
    q: Optional[str] = None
    city: Optional[str] = None
    listing_type: Optional[str] = None  # "For Sale" | "For Rent" | "Short-Let"
    property_type: Optional[str] = None  # "Apartment", "Villa", ...
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_beds: Optional[int] = None
    min_baths: Optional[int] = None
    # Optional map bbox: [minLng, minLat, maxLng, maxLat]
    bbox: Optional[List[float]] = None


class SavedSearchIn(BaseModel):
    name: str
    criteria: SavedSearchCriteria
    alerts_enabled: bool = True


class AlertToggleIn(BaseModel):
    enabled: bool


class SavedSearchOut(BaseModel):
    id: str
    user_id: str
    name: str
    criteria: SavedSearchCriteria
    alerts_enabled: bool
    new_matches_since_seen: int = 0
    last_run_at: Optional[str] = None
    created_at: str


def register_saved_search_routes(
    db: AsyncIOMotorDatabase,
    require_auth,  # callable → dict (current user)
) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["saved-searches"])

    @router.post("/saved-searches", response_model=SavedSearchOut)
    async def create_saved_search(
        data: SavedSearchIn, user: dict = Depends(require_auth)
    ):
        # Cap per user (avoid abuse)
        count = await db.saved_searches.count_documents({"user_id": user["id"]})
        if count >= 20:
            raise HTTPException(400, "Maximum of 20 saved searches per user")
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "name": data.name.strip()[:80] or "Untitled search",
            "criteria": data.criteria.model_dump(),
            "alerts_enabled": data.alerts_enabled,
            "new_matches_since_seen": 0,
            "last_run_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.saved_searches.insert_one(dict(doc))
        return SavedSearchOut(**doc)

    @router.get("/saved-searches")
    async def list_saved_searches(user: dict = Depends(require_auth)):
        docs = (
            await db.saved_searches.find({"user_id": user["id"]}, {"_id": 0})
            .sort("created_at", -1)
            .to_list(50)
        )
        return docs

    @router.delete("/saved-searches/{search_id}")
    async def delete_saved_search(search_id: str, user: dict = Depends(require_auth)):
        res = await db.saved_searches.delete_one(
            {"id": search_id, "user_id": user["id"]}
        )
        if res.deleted_count == 0:
            raise HTTPException(404, "Saved search not found")
        return {"ok": True}

    @router.patch("/saved-searches/{search_id}/alerts")
    async def toggle_alerts(
        search_id: str, data: AlertToggleIn, user: dict = Depends(require_auth)
    ):
        res = await db.saved_searches.update_one(
            {"id": search_id, "user_id": user["id"]},
            {"$set": {"alerts_enabled": data.enabled}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Saved search not found")
        return {"ok": True, "alerts_enabled": data.enabled}

    @router.post("/saved-searches/{search_id}/run")
    async def run_saved_search(
        search_id: str,
        limit: int = Query(30, le=60),
        user: dict = Depends(require_auth),
    ):
        s = await db.saved_searches.find_one(
            {"id": search_id, "user_id": user["id"]}, {"_id": 0}
        )
        if not s:
            raise HTTPException(404, "Saved search not found")
        c = s.get("criteria", {})
        # Build a Mongo filter matching the shape of the /properties route
        query: dict = {}
        if c.get("q"):
            query["$or"] = [
                {"title": {"$regex": c["q"], "$options": "i"}},
                {"description": {"$regex": c["q"], "$options": "i"}},
                {"location": {"$regex": c["q"], "$options": "i"}},
                {"city": {"$regex": c["q"], "$options": "i"}},
            ]
        for f, k in [
            ("city", "city"),
            ("listing_type", "listing_type"),
            ("property_type", "property_type"),
        ]:
            if c.get(k):
                query[f] = c[k]
        if c.get("min_price") is not None:
            query.setdefault("price", {})["$gte"] = float(c["min_price"])
        if c.get("max_price") is not None:
            query.setdefault("price", {})["$lte"] = float(c["max_price"])
        if c.get("min_beds") is not None:
            query["bedrooms"] = {"$gte": int(c["min_beds"])}
        if c.get("min_baths") is not None:
            query["bathrooms"] = {"$gte": int(c["min_baths"])}
        if c.get("bbox"):
            b = c["bbox"]
            if len(b) == 4:
                query["longitude"] = {"$gte": b[0], "$lte": b[2]}
                query["latitude"] = {"$gte": b[1], "$lte": b[3]}
        docs = (
            await db.properties.find(query, {"_id": 0})
            .sort("posted_at", -1)
            .limit(limit)
            .to_list(limit)
        )
        # Reset badge & stamp run time
        await db.saved_searches.update_one(
            {"id": search_id},
            {
                "$set": {
                    "new_matches_since_seen": 0,
                    "last_run_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        return {"count": len(docs), "matches": docs}

    return router
