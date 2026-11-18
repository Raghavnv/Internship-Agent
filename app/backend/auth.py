"""Verifies Supabase access tokens sent by the frontend (Authorization: Bearer <token>).

Asks Supabase's auth server who the token belongs to (works with any signing-key setup) and caches
the answer for a few minutes. With SUPABASE_URL unset (local development), requests are allowed
and attributed to a 'local' user.
"""
from __future__ import annotations

import os
import time

import httpx
from fastapi import Header, HTTPException

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY") or ""
_cache: dict[str, tuple[float, dict]] = {}
TTL = 300


def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not SUPABASE_URL:
        return {"id": "local", "email": None}
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Please sign in.")
    token = authorization.split(" ", 1)[1].strip()
    hit = _cache.get(token)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    try:
        r = httpx.get(f"{SUPABASE_URL}/auth/v1/user", timeout=10,
                      headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_ANON_KEY})
    except httpx.HTTPError:
        raise HTTPException(503, "Couldn't reach the sign-in service. Try again in a moment.")
    if r.status_code != 200:
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    data = r.json()
    user = {"id": data.get("id"), "email": data.get("email")}
    if len(_cache) > 5000:
        _cache.clear()
    _cache[token] = (time.time(), user)
    return user
