"""Internship Copilot API.

Run locally:  uvicorn main:app --reload   (from app/backend)
"""
from __future__ import annotations

import logging
import os
import time
from collections import Counter, defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import llm
from data import store
from search import search

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
IST = timezone(timedelta(hours=5, minutes=30))
PASSCODE = os.getenv("APP_PASSCODE")  # optional: protects your LLM key on a public URL
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
CHAT_PER_HOUR = int(os.getenv("CHAT_RATE_PER_HOUR", "60"))

app = FastAPI(title="Internship Copilot API")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])
_hits: dict[str, deque] = defaultdict(deque)


def guard(request: Request, x_passcode: str | None = Header(default=None)):
    if PASSCODE and x_passcode != PASSCODE:
        raise HTTPException(401, "Passcode required")


def rate_limit(request: Request):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]
    q, now = _hits[ip], time.time()
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= CHAT_PER_HOUR:
        raise HTTPException(429, "Too many questions this hour, try again later.")
    q.append(now)


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


@app.get("/api/health")
def health():
    return {"ok": True, "llm": bool(llm.API_KEY), "model": llm.MODEL}


@app.get("/api/meta", dependencies=[Depends(guard)])
def get_meta():
    jobs = store.get()
    m = meta()
    m["top_companies"] = Counter(j.get("company") for j in jobs).most_common(8)
    m["passcode_required"] = bool(PASSCODE)
    return m


@app.post("/api/search", dependencies=[Depends(guard)])
def post_search(filters: dict):
    args = {k: v for k, v in filters.items() if k in llm.ALLOWED - {"group_by", "top"}}
    try:
        return {**search(store.get(), **args), "args": args}
    except TypeError as e:
        raise HTTPException(400, str(e))


@app.post("/api/chat", dependencies=[Depends(guard), Depends(rate_limit)])
def post_chat(body: ChatIn):
    try:
        out = llm.chat([m.model_dump() for m in body.messages], store.get(), meta())
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    return {**out, "meta": meta()}
