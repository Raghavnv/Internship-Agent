"""Internship Copilot API.

Run locally:  uvicorn main:app --reload   (from app/backend)
"""
from __future__ import annotations

import logging
import os
import time
from collections import Counter, defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import coach
import fit as fitlib
import jobdetail
import llm
import resume as resume_ai
from auth import current_user
from data import store
from geo import geocode
from search import city_map, compact, insights, search

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
IST = timezone(timedelta(hours=5, minutes=30))
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
CHAT_PER_HOUR = int(os.getenv("CHAT_RATE_PER_HOUR", "60"))
RESUME_PER_HOUR = int(os.getenv("RESUME_RATE_PER_HOUR", "15"))

app = FastAPI(title="Internship Copilot API")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])
_hits: dict[str, deque] = defaultdict(deque)


def limited(bucket: str, per_hour: int):
    def dep(user: dict = Depends(current_user)):
        q, now = _hits[f"{bucket}:{user['id']}"], time.time()
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= per_hour:
            raise HTTPException(429, "You've hit this hour's limit. Try again a bit later.")
        q.append(now)
        return user
    return dep


def meta():
    jobs = store.get()
    upd = store.updated or int(store.loaded_at)
    return {"count": len(jobs), "updated": upd,
            "updated_human": datetime.fromtimestamp(upd, IST).strftime("%d %b %Y, %I:%M %p IST")}


class Msg(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    messages: list[Msg] = Field(min_length=1, max_length=40)
    profile: dict | None = None


class ReviewIn(BaseModel):
    resume_text: str = Field(min_length=50, max_length=30000)
    job: dict


# ── public ──────────────────────────────────────────────────
@app.get("/api/health")
def health():
    from auth import SUPABASE_URL
    return {"ok": True, "llm": bool(llm.API_KEY), "model": llm.MODEL, "auth": bool(SUPABASE_URL)}


@app.get("/api/meta")
def get_meta():
    jobs = store.get()
    m = meta()
    m["top_companies"] = Counter(j.get("company") for j in jobs).most_common(8)
    m["cities"] = len({tuple(g[:2]) for j in jobs for g in (j.get("geo") or []) if g})
    m["companies"] = len({j.get("company") for j in jobs})
    return m


_map_cache = {"at": 0.0, "data": None}


@app.get("/api/map")
def get_map():
    jobs = store.get()
    if _map_cache["at"] != store.loaded_at:
        _map_cache.update(at=store.loaded_at, data=city_map(jobs))
    return {"cities": _map_cache["data"], "home": {"lat": 12.972, "lng": 77.594, "city": "Bengaluru"}}


@app.get("/api/geocode")
def get_geocode(q: str):
    g = geocode(q[:120])
    if not g:
        raise HTTPException(404, "Couldn't place that location.")
    return {"lat": g[0], "lng": g[1], "city": g[2]}


# ── signed in ───────────────────────────────────────────────
@app.post("/api/search")
def post_search(body: dict, user: dict = Depends(current_user)):
    profile = body.pop("profile", None)
    args = {k: v for k, v in body.items() if k in llm.ALLOWED - {"group_by", "top"} | {"offset"}}
    try:
        return {**search(store.get(), profile=profile, **args), "args": args}
    except TypeError as e:
        raise HTTPException(400, str(e))


@app.post("/api/insights")
def post_insights(body: dict, user: dict = Depends(current_user)):
    """Chart data for the roles matching these filters (defaults to the user's strong fits)."""
    profile = body.pop("profile", None)
    args = {k: v for k, v in body.items() if k in llm.ALLOWED - {"group_by", "top", "sort", "limit"}}
    args.setdefault("fit_only", bool(profile))
    try:
        return insights(store.get(), profile=profile, **args)
    except TypeError as e:
        raise HTTPException(400, str(e))


_index: dict = {"key": None, "by_id": {}}


def job_by_id(jid: str):
    jobs = store.get()
    if _index["key"] is not id(jobs):
        _index.update(key=id(jobs), by_id={j["id"]: j for j in jobs})
    return _index["by_id"].get(jid)


class JobIn(BaseModel):
    id: str = Field(max_length=300)
    profile: dict | None = None


@app.post("/api/job")
def post_job(body: JobIn, user: dict = Depends(limited("job", 600))):
    """One listing in full: every location, how it fits this user, and the description when we can read it."""
    j = job_by_id(body.id)
    if not j:
        raise HTTPException(404, "This listing is no longer live.")
    out = compact(j)
    out["locations"] = j.get("locations") or []
    out["more_locations"] = 0
    out["degrees"] = j.get("degrees") or []
    out["pins"] = [g[:2] for g in (j.get("geo") or []) if g][:12]
    checks = []
    if body.profile:
        prof = fitlib.prepare(body.profile)
        out["fit"] = fitlib.score(j, prof)[0]
        checks = fitlib.explain(j, prof)
    return {"job": out, "checks": checks, "description": jobdetail.description(j.get("url", ""))}


class CoachIn(BaseModel):
    id: str | None = Field(default=None, max_length=300)
    job: dict | None = None                     # used when the listing isn't live any more
    description: str | None = Field(default=None, max_length=20000)   # pasted by the user
    profile: dict = Field(default_factory=dict)
    projects: list = Field(default_factory=list)


def _coach_job(body: CoachIn) -> dict:
    j = job_by_id(body.id) if body.id else None
    j = j or body.job
    if not j:
        raise HTTPException(404, "This listing is no longer live.")
    return j


@app.post("/api/tailor")
def post_tailor(body: CoachIn, user: dict = Depends(limited("coach", RESUME_PER_HOUR * 2))):
    """Keywords this listing wants that you have / lack, and your bullets rewritten for it."""
    j = _coach_job(body)
    desc = (body.description or "").strip()
    if not desc:
        d = jobdetail.description(j.get("url", ""))
        desc = "\n".join(b["text"] for b in (d or {}).get("blocks", []))
    return coach.tailor(j, desc, body.profile, body.projects[:20])


@app.post("/api/referral")
def post_referral(body: CoachIn, user: dict = Depends(limited("coach", RESUME_PER_HOUR * 2))):
    """A LinkedIn connection note and follow-up message asking for a referral."""
    return coach.referral(_coach_job(body), body.profile, body.projects[:20])


@app.post("/api/chat")
def post_chat(body: ChatIn, user: dict = Depends(limited("chat", CHAT_PER_HOUR))):
    try:
        out = llm.chat([m.model_dump() for m in body.messages], store.get(), meta(), body.profile)
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    return {**out, "meta": meta()}


@app.post("/api/resume/parse")
async def post_resume_parse(file: UploadFile = File(...), user: dict = Depends(limited("resume", RESUME_PER_HOUR))):
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "Please upload a PDF under 5 MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(415, "Please upload your resume as a PDF.")
    try:
        text = resume_ai.pdf_text(data)
    except Exception:
        raise HTTPException(422, "Couldn't read that PDF. Try exporting it again from Word or Google Docs.")
    if len(text) < 50:
        raise HTTPException(422, "That PDF has no readable text (it may be a scanned image).")
    try:
        profile = resume_ai.extract_profile(text)
    except RuntimeError:
        profile = {}  # still return the text so the review feature works
    return {"text": text, "profile": profile}


@app.post("/api/resume/review")
def post_resume_review(body: ReviewIn, user: dict = Depends(limited("resume", RESUME_PER_HOUR))):
    try:
        return {"review": resume_ai.review(body.resume_text, body.job)}
    except RuntimeError as e:
        raise HTTPException(502, str(e))
