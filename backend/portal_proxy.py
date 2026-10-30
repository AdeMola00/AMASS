import os
from urllib.parse import unquote
import httpx
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse, Response

from server import get_current_user, effective_permissions

PORTAL_BASE = os.environ["AMASS_PORTAL_BASE_URL"].rstrip("/")
PORTAL_KEY = os.environ["AMASS_PORTAL_KEY"]

# Kept local: dashboard sign-in, who can log in, and their roles.
LOCAL_PREFIXES = ("auth", "public", "admin-users", "roles")
MODULE_MAP = {
    "ai": "ai_management", "app-config": "app_config", "platform-users": "users",
    "property-owners": "property_owners", "leads-export": "leads",
    "properties-meta": "properties", "tokens": "tokens", "payments": "payments",
}
ACTIONS = {"GET": "view", "POST": "create", "PUT": "edit", "PATCH": "edit", "DELETE": "delete"}
PASS_HEADERS = ("content-type", "content-disposition", "cache-control")

client = httpx.AsyncClient(timeout=60.0)


def _module(parts: list) -> str:
    if parts[0] == "properties" and len(parts) >= 3 and parts[2] == "verify":
        return "property_verification"
    return MODULE_MAP.get(parts[0], parts[0].replace("-", "_"))


async def _authorize(request: Request, parts: list):
    user = await get_current_user(request)
    if user["role"] == "super_admin":
        return
    perms = await effective_permissions(user)
    if not perms.get(_module(parts), {}).get(ACTIONS.get(request.method, "view"), False):
        raise HTTPException(status_code=403, detail="You do not have permission for this action")


async def _forward(request: Request, sub: str) -> Response:
    headers = {"X-AMASS-Portal-Key": PORTAL_KEY}
    if request.headers.get("content-type"):
        headers["Content-Type"] = request.headers["content-type"]
    try:
        r = await client.request(request.method, f"{PORTAL_BASE}/{sub}", params=request.query_params,
                                 content=await request.body(), headers=headers)
    except httpx.HTTPError:
        return JSONResponse({"detail": "AMASS backend is unreachable. Please try again."}, status_code=502)
    out = {k: v for k, v in r.headers.items() if k.lower() in PASS_HEADERS}
    return Response(content=r.content, status_code=r.status_code, headers=out)


def register(app):
    @app.middleware("http")
    async def portal_proxy(request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/") or request.method == "OPTIONS":
            return await call_next(request)
        raw = request.scope.get("raw_path", b"").decode("latin-1")
        decoded = unquote(unquote(raw))
        if ".." in decoded or "\\" in decoded or "%" in decoded.split("?")[0]:
            return JSONResponse({"detail": "Invalid path"}, status_code=400)
        sub = path[len("/api/"):].strip("/")
        parts = sub.split("/") if sub else [""]
        if parts[0] in ("",) + LOCAL_PREFIXES:
            return await call_next(request)
        is_media_file = request.method == "GET" and parts[0] == "media" and len(parts) > 2 and parts[1] == "file"
        if not is_media_file:
            try:
                await _authorize(request, parts)
            except HTTPException as e:
                return JSONResponse({"detail": e.detail}, status_code=e.status_code)
        return await _forward(request, sub)
