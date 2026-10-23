"""Product-funnel analytics (instrumented BEFORE the social release so before/after can be compared).

Client events are append-only and cheap; the money truth comes from the monetization ledger
(`entitlements` / `unlock_requests`), never from client events.

POST /api/analytics/events  {events:[{name, props?, ts?, session_id?}]}   (auth optional)
GET  /api/admin/analytics/funnel?days=30                                  (admin)

Allowed client event names (anything else is dropped silently):
  marker_impression{count}  marker_tap{property_id}  property_detail_view{property_id, arrived_via}
  paid_action_start{property_id, feature_key, arrived_via}  payment_completed{…}  payment_failed{…}
  share_open{property_id, via}  signin_start{method}  otp_sent  otp_verified
  contact_match_optin  contact_match_result{matches}  connection_sent  connection_accepted
  estate_request  estate_approved  collection_created  collection_invite  collection_item_added
  event_rsvp  question_asked  question_answered  report_submitted  neighbours_open

`arrived_via` vocabulary: direct | friend | collection | estate | recommendation | share | search
"""
from __future__ import annotations

import csv
import io
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field

ALLOWED = {
    "marker_impression", "marker_tap", "property_detail_view", "paid_action_start", "payment_completed",
    "payment_failed", "share_open", "signin_start", "signin_complete", "otp_sent", "otp_verified",
    "contact_match_optin", "contact_match_result", "connection_sent", "connection_accepted", "estate_request",
    "estate_approved", "collection_created", "collection_invite", "collection_item_added", "event_rsvp",
    "question_asked", "question_answered", "report_submitted", "neighbours_open",
    "shop_open", "shop_store_view", "shop_product_view", "shop_add_to_basket", "shop_retailer_handoff", "shop_search",
}
VIA = ("direct", "friend", "collection", "estate", "recommendation", "share", "search")


class ClientEvent(BaseModel):
    name: str = Field(max_length=48)
    props: dict[str, Any] = Field(default_factory=dict)
    ts: Optional[str] = None
    session_id: Optional[str] = Field(None, max_length=64)


class EventsIn(BaseModel):
    events: list[ClientEvent] = Field(max_length=100)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def register_analytics_routes(db, bearer, decode_user_id, require_admin):
    router = APIRouter(prefix="/api", tags=["analytics"])

    @router.post("/analytics/events")
    async def ingest(data: EventsIn, creds=Depends(bearer)):
        user_id = decode_user_id(creds.credentials) if creds else None
        now = _now()
        docs = []
        for ev in data.events:
            if ev.name not in ALLOWED:
                continue
            props = {k: v for k, v in (ev.props or {}).items() if isinstance(v, (str, int, float, bool)) and len(str(v)) <= 120}
            via = props.get("arrived_via")
            if via and via not in VIA:
                props["arrived_via"] = "direct"
            docs.append({
                "id": str(uuid.uuid4()),
                "name": ev.name,
                "user_id": user_id,
                "session_id": ev.session_id,
                "props": props,
                "created_at": now,
            })
        if docs:
            await db.analytics_events.insert_many(docs)
        return {"ok": True, "accepted": len(docs)}

    @router.get("/admin/analytics/funnel")
    async def funnel(days: int = Query(30, ge=1, le=365), _: dict = Depends(require_admin)):
        return await _funnel(days)

    @router.get("/admin/analytics/funnel.csv")
    async def funnel_csv(days: int = Query(30, ge=1, le=365), _: dict = Depends(require_admin)):
        """Same numbers as the JSON funnel, flattened to a board-friendly CSV
        (section, metric, current, previous, change)."""
        data = await _funnel(days)
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["AMASS Neighbours → paid funnel", f"last {days} days", f"since {data['since'][:10]}", f"generated {_now().isoformat(timespec='seconds')}"])
        w.writerow([])
        w.writerow(["section", "metric", "current", "previous", "change_pct"])

        def change(cur, prev):
            if prev in (0, None) or cur is None:
                return ""
            return f"{((cur - prev) / prev) * 100:.1f}"

        cur, prev = data["current"], data["previous"]
        for k in ("marker_impressions", "marker_taps", "detail_views", "paid_action_starts", "payments_completed", "payments_failed"):
            w.writerow(["funnel", k, cur[k], prev[k], change(cur[k], prev[k])])
        for k in ("tap_rate", "detail_to_start", "start_to_paid"):
            w.writerow(["funnel_rates", k, "" if cur[k] is None else cur[k], "" if prev[k] is None else prev[k], ""])
        social_paid = sum(data["attribution"][v]["payments_completed"] for v in ("friend", "collection", "estate", "recommendation"))
        total_paid = sum(a["payments_completed"] for a in data["attribution"].values())
        w.writerow(["attribution", "social_share_of_paid", f"{(social_paid / total_paid):.4f}" if total_paid else "", "", ""])
        for via, a in data["attribution"].items():
            for k in ("detail_views", "paid_action_starts", "payments_completed"):
                w.writerow(["attribution", f"{via}.{k}", a[k], "", ""])
        for section in ("signin", "social", "moderation"):
            for k, v in data[section].items():
                w.writerow([section, k, "" if v is None else v, "", ""])
        w.writerow([])
        w.writerow(["note", data["note"]])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="amass-neighbours-funnel-{days}d-{_now().date().isoformat()}.csv"'},
        )

    async def _funnel(days: int) -> dict:
        since = _now() - timedelta(days=days)
        prev_since = since - timedelta(days=days)

        async def count(name: str, start: datetime, end: Optional[datetime] = None, extra: Optional[dict] = None) -> int:
            q: dict = {"name": name, "created_at": {"$gte": start}}
            if end:
                q["created_at"]["$lt"] = end
            if extra:
                q.update(extra)
            return await db.analytics_events.count_documents(q)

        async def summed(name: str, field: str, start: datetime, end: Optional[datetime] = None) -> int:
            q: dict = {"name": name, "created_at": {"$gte": start}}
            if end:
                q["created_at"]["$lt"] = end
            pipeline = [{"$match": q}, {"$group": {"_id": None, "n": {"$sum": {"$ifNull": [f"$props.{field}", 1]}}}}]
            rows = await db.analytics_events.aggregate(pipeline).to_list(1)
            return int(rows[0]["n"]) if rows else 0

        async def window(start: datetime, end: Optional[datetime]) -> dict:
            impressions = await summed("marker_impression", "count", start, end)
            taps = await count("marker_tap", start, end)
            detail_views = await count("property_detail_view", start, end)
            paid_starts = await count("paid_action_start", start, end)
            # Money truth: the ledger.
            ent_q: dict = {"feature_key": "property", "status": "active", "created_at": {"$gte": start}}
            fail_q: dict = {"status": "failed", "created_at": {"$gte": start}}
            if end:
                ent_q["created_at"]["$lt"] = end
                fail_q["created_at"]["$lt"] = end
            paid = await db.entitlements.count_documents(ent_q)
            failed = await db.unlock_requests.count_documents(fail_q)
            return {
                "marker_impressions": impressions,
                "marker_taps": taps,
                "detail_views": detail_views,
                "paid_action_starts": paid_starts,
                "payments_completed": paid,
                "payments_failed": failed,
                "tap_rate": round(taps / impressions, 4) if impressions else None,
                "detail_to_start": round(paid_starts / detail_views, 4) if detail_views else None,
                "start_to_paid": round(paid / paid_starts, 4) if paid_starts else None,
            }

        current = await window(since, None)
        previous = await window(prev_since, since)

        # Attribution: where did paying/intent users arrive from?
        via_rows = await db.analytics_events.aggregate([
            {"$match": {"name": {"$in": ["property_detail_view", "paid_action_start", "payment_completed"]}, "created_at": {"$gte": since}}},
            {"$group": {"_id": {"via": {"$ifNull": ["$props.arrived_via", "direct"]}, "name": "$name"}, "n": {"$sum": 1}}},
        ]).to_list(200)
        attribution: dict[str, dict[str, int]] = {v: {"detail_views": 0, "paid_action_starts": 0, "payments_completed": 0} for v in VIA}
        key = {"property_detail_view": "detail_views", "paid_action_start": "paid_action_starts", "payment_completed": "payments_completed"}
        for r in via_rows:
            via = r["_id"]["via"] if r["_id"]["via"] in attribution else "direct"
            attribution[via][key[r["_id"]["name"]]] += r["n"]

        # Sign-in / verification
        signin = {
            "starts": await count("signin_start", since),
            "otp_sent": await count("otp_sent", since),
            "otp_verified": await count("otp_verified", since),
            "completed": await count("signin_complete", since),
            "phone_completed": await count("signin_complete", since, extra={"props.method": "phone"}),
        }
        # Social adoption (server collections are the truth where available)
        social = {
            "contact_match_optins": await count("contact_match_optin", since),
            "connections_sent": await db.connections.count_documents({"created_at": {"$gte": since}}),
            "connections_accepted": await db.connections.count_documents({"status": "accepted", "responded_at": {"$gte": since}}),
            "estate_requests": await db.estate_members.count_documents({"created_at": {"$gte": since}}),
            "estate_approvals": await db.estate_members.count_documents({"status": "approved", "approved_at": {"$gte": since}}),
            "active_estates": len(await db.estate_posts.distinct("estate_id", {"created_at": {"$gte": since}})),
            "collections_created": await db.shared_collections.count_documents({"created_at": {"$gte": since}}),
            "collections_shared": await db.shared_collections.count_documents({"created_at": {"$gte": since}, "member_ids.1": {"$exists": True}}),
            "collection_items_added": await db.collection_items.count_documents({"created_at": {"$gte": since}}),
            "event_rsvps": await db.event_rsvps.count_documents({"created_at": {"$gte": since}, "status": "going"}),
            "questions_asked": await db.estate_posts.count_documents({"type": "question", "created_at": {"$gte": since}}),
            "questions_answered": await db.estate_posts.count_documents({"type": "question", "created_at": {"$gte": since}, "answers_count": {"$gt": 0}}),
            "service_requests": await db.service_requests.count_documents({"created_at": {"$gte": since}}),
        }
        reports_open = await db.social_reports.count_documents({"status": "OPEN"})
        resolved = await db.social_reports.find({"status": "RESOLVED", "resolved_at": {"$gte": since}}, {"_id": 0, "created_at": 1, "resolved_at": 1}).to_list(500)
        hours = [(r["resolved_at"] - r["created_at"]).total_seconds() / 3600 for r in resolved if r.get("resolved_at") and r.get("created_at")]
        moderation = {
            "reports_open": reports_open,
            "reports_resolved": len(resolved),
            "median_response_hours": round(statistics.median(hours), 1) if hours else None,
            "feedback_count": await db.social_feedback.count_documents({"created_at": {"$gte": since}}),
        }
        return {
            "days": days,
            "since": since.isoformat(),
            "current": current,
            "previous": previous,
            "attribution": attribution,
            "signin": signin,
            "social": social,
            "moderation": moderation,
            "note": "payments_completed/failed come from the monetization ledger; client events are directional only.",
        }

    return router


async def ensure_analytics_indexes(db) -> None:
    await db.analytics_events.create_index([("name", 1), ("created_at", -1)])
    await db.analytics_events.create_index([("user_id", 1), ("created_at", -1)])
    await db.analytics_events.create_index("created_at", expireAfterSeconds=60 * 60 * 24 * 400)
