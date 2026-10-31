import os
from typing import Any, Dict
import httpx
from fastapi import Depends, HTTPException
from pydantic import BaseModel

from server import api, require, log_activity

WEBSITE_BASE = "https://discover-properties-1.emergent.host/api"
WEBSITE_KEY = os.environ["AMASS_WEBSITE_API_KEY"]
LEAD_STATUSES = {"new", "contacted", "closed"}

client = httpx.AsyncClient(timeout=30.0)


class WebsiteLeadStatus(BaseModel):
    status: str


async def _call(method: str, path: str, json: Any = None):
    try:
        r = await client.request(method, f"{WEBSITE_BASE}{path}", json=json, headers={"X-API-Key": WEBSITE_KEY})
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="AMASS website is unreachable. Please try again.")
    if r.status_code >= 400:
        try:
            detail = r.json().get("detail", "Website request failed")
        except ValueError:
            detail = "Website request failed"
        raise HTTPException(status_code=r.status_code if r.status_code < 500 else 502, detail=detail)
    return r.json()


@api.get("/website/stats")
async def website_stats(user: dict = Depends(require("leads"))):
    return await _call("GET", "/admin/stats")


@api.get("/website/leads")
async def website_leads(user: dict = Depends(require("leads"))):
    return await _call("GET", "/admin/leads")


@api.get("/website/newsletter")
async def website_newsletter(user: dict = Depends(require("leads"))):
    return await _call("GET", "/admin/newsletter")


@api.patch("/website/leads/{lead_id}")
async def website_lead_status(lead_id: str, body: WebsiteLeadStatus, user: dict = Depends(require("leads", "edit"))):
    if body.status not in LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Status must be new, contacted or closed")
    res = await _call("PATCH", f"/admin/leads/{lead_id}", {"status": body.status})
    await log_activity(f"Website lead marked {body.status}", "website_lead", user, lead_id)
    return res


@api.get("/website/content")
async def website_content(user: dict = Depends(require("cms"))):
    return await _call("GET", "/admin/content")


@api.put("/website/content")
async def website_content_update(body: Dict[str, Any], user: dict = Depends(require("cms", "edit"))):
    body.pop("updated_at", None)
    body.pop("_id", None)
    res = await _call("PUT", "/admin/content", body)
    await log_activity("Updated website content", "website_content", user)
    return res
