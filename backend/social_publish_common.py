"""Shared constants + helpers for social publishing (platform catalogue, settings defaults, env keys, token crypto)."""
from __future__ import annotations

import base64
import hashlib
import os
from datetime import datetime, timezone
from typing import Literal, Optional

from cryptography.fernet import Fernet, InvalidToken

Platform = Literal["facebook", "instagram", "x", "linkedin", "tiktok"]
PLATFORM_ORDER: list[str] = ["facebook", "instagram", "x", "linkedin", "tiktok"]

PLATFORMS: dict[str, dict] = {
    "facebook": {"label": "Facebook Page", "icon": "logo-facebook", "limit": 5000, "link_in_caption": True, "auth": "keys", "keys": ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN"],
                 "how": "Meta for Developers → your app → Graph API Explorer: generate a User token with pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish; call /me/accounts and copy the Page id + Page access_token (make it long-lived)."},
    "instagram": {"label": "Instagram", "icon": "logo-instagram", "limit": 2200, "link_in_caption": False, "auth": "keys", "keys": ["META_IG_USER_ID", "META_PAGE_ACCESS_TOKEN"],
                  "how": "Instagram must be a Business/Creator account linked to the Facebook Page. /me/accounts?fields=instagram_business_account returns the IG user id. Uses the same Page token. Images must be public JPEG URLs; max 25 API posts per 24 h. Captions can't carry clickable links — the post says 'link in bio'."},
    "x": {"label": "X (Twitter)", "icon": "logo-twitter", "limit": 280, "link_in_caption": True, "auth": "keys", "keys": ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"],
          "how": "developer.x.com → Projects & Apps → your app → User authentication settings: App permissions 'Read and write'. Keys and tokens tab: copy API Key + Secret, then generate Access Token + Secret (must show 'Read and Write')."},
    "linkedin": {"label": "LinkedIn Page", "icon": "logo-linkedin", "limit": 3000, "link_in_caption": True, "auth": "oauth", "keys": ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"], "optional_keys": ["LINKEDIN_ORGANIZATION_ID", "LINKEDIN_ACCESS_TOKEN"],
                 "how": "linkedin.com/developers → create an app owned by the AMASS Company Page → request the Community Management API product (scopes w_organization_social, r_organization_social) → Auth tab: copy Client ID + Secret and add the redirect URL shown below. Then tap Connect and sign in as a Page admin. Tokens last 60 days — reconnect when it expires."},
    "tiktok": {"label": "TikTok", "icon": "logo-tiktok", "limit": 4000, "title_limit": 90, "link_in_caption": False, "auth": "oauth", "keys": ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
               "how": "developers.tiktok.com → Manage apps → add Login Kit + Content Posting API → scopes video.publish (+ user.info.basic) → add the redirect URL shown below → verify the image domain under URL properties → copy Client key + secret. Until TikTok approves the app, posts are published privately (SELF_ONLY)."},
}

DEFAULT_SETTINGS: dict = {
    "auto_post": {"facebook": True, "instagram": True, "x": True, "linkedin": True, "tiktok": False},
    "hashtags": ["AMASS", "AmassAfrica", "RealEstateNigeria", "LagosProperty", "PropertyNigeria", "HouseHunting"],
    "ios_store_url": "",
    "android_store_url": "",
    "instagram_bio_note": "Tap the link in our bio to open this home in the AMASS app",
    "tiktok_privacy": "SELF_ONLY",
    "footer": "Download AMASS — Africa's Property Intelligence",
}



def now() -> datetime:
    return datetime.now(timezone.utc)


def env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def missing_keys(platform: str) -> list[str]:
    return [k for k in PLATFORMS[platform]["keys"] if not env(k)]


# ─── token crypto (Fernet keyed from JWT_SECRET) ───
def _fernet() -> Fernet:
    secret = (os.environ.get("JWT_SECRET") or "amass-dev").encode("utf-8")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret).digest()))


def enc(value: Optional[str]) -> Optional[str]:
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8") if value else None


def dec(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None
