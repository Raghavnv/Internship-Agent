"""Two-way WhatsApp: message the internship agent from your own WhatsApp and it answers from the live listings.

Meta's WhatsApp Cloud API calls the webhook (main.py: /api/whatsapp/webhook) for every message sent to the
business number. We only answer the owner's number (META_WA_TO), check Meta's signature, and reply with a
normal text message (allowed because the owner just messaged us, so the 24h window is open).

Env: META_WA_TOKEN, META_WA_PHONE_NUMBER_ID, META_WA_TO (owner, comma-separate more than one),
     META_WA_VERIFY_TOKEN (any string you choose, also typed into Meta's webhook form),
     META_APP_SECRET (Meta app -> Settings -> Basic -> App secret; used to verify requests really come from Meta).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import time
from collections import OrderedDict, defaultdict, deque

import httpx

import llm
import market
from search import search

log = logging.getLogger("whatsapp")
GRAPH = os.getenv("META_GRAPH_URL", "https://graph.facebook.com").rstrip("/")
VER = os.getenv("META_WA_API_VERSION", "v25.0")
MAX_CHARS = 3800
PER_HOUR = int(os.getenv("WA_RATE_PER_HOUR", "60"))
TOP = 6


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _env():
    return {"token": os.getenv("META_WA_TOKEN"), "pnid": os.getenv("META_WA_PHONE_NUMBER_ID"),
            "owners": {_digits(x) for x in (os.getenv("META_WA_TO") or "").split(",") if _digits(x)},
            "verify": os.getenv("META_WA_VERIFY_TOKEN"), "secret": os.getenv("META_APP_SECRET")}


def configured() -> bool:
    e = _env()
    return bool(e["token"] and e["pnid"] and e["owners"])


# ── webhook security ─────────────────────────────────────────
def verify_challenge(mode, token, challenge):
    """Meta's one-time GET handshake when you save the webhook URL."""
    v = _env()["verify"]
    if mode == "subscribe" and v and token and hmac.compare_digest(str(token), v):
        return challenge
    return None


def signature_ok(body: bytes, header: str | None) -> bool:
    """X-Hub-Signature-256 = sha256 HMAC of the raw body with the app secret. No secret set = refuse."""
    secret = _env()["secret"]
    if not secret or not header or not header.startswith("sha256="):
        return False
    want = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, header.split("=", 1)[1])


# ── incoming messages ────────────────────────────────────────
_seen: "OrderedDict[str, float]" = OrderedDict()           # Meta retries; answer each message once
_rate: dict[str, deque] = defaultdict(deque)
_memory: dict[str, list] = {}                               # last few turns per sender, so follow-ups work
MEMORY_TURNS, MEMORY_TTL = 8, 2 * 3600


def extract(payload: dict):
    """[(message_id, sender_digits, type, text)] from a webhook payload (status updates are ignored)."""
    out = []
    for entry in payload.get("entry") or []:
        for ch in entry.get("changes") or []:
            for m in (ch.get("value") or {}).get("messages") or []:
                body = ((m.get("text") or {}).get("body")
                        or (m.get("interactive") or {}).get("button_reply", {}).get("title") or "")
                out.append((m.get("id"), _digits(m.get("from")), m.get("type"), body.strip()))
    return out


def _fresh(mid) -> bool:
    if not mid or mid in _seen:
        return False
    _seen[mid] = time.time()
    while len(_seen) > 500:
        _seen.popitem(last=False)
    return True


def _allowed(sender) -> bool:
    q, now = _rate[sender], time.time()
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= PER_HOUR:
        return False
    q.append(now)
    return True


# ── formatting ───────────────────────────────────────────────
def _short_terms(terms):
    return ", ".join((t or "").replace("20", "’", 1) for t in (terms or [])[:2])


def format_job(j, n=None) -> str:
    head = f"{n}. " if n else ""
    locs = (j.get("locations") or [])[:1]
    meta = [x for x in [locs[0] if locs else None, _short_terms(j.get("terms")),
                        f"match {int(j['fit'])}" if j.get("fit") else None,
                        f"closes in {j['closes_in']}d" if j.get("closes_in") is not None else None] if x]
    return f"{head}*{j.get('title')}*, {j.get('company')}\n{' · '.join(meta)}\n{j.get('url')}"


def format_jobs(res: dict, header: str, n=TOP) -> str:
    rows = (res or {}).get("results") or []
    if not rows:
        return f"{header}\nNothing matches right now."
    total = res.get("total", len(rows))
    more = f"\n\n…and {total - len(rows[:n])} more on the website." if total > n else ""
    return f"{header} ({total})\n\n" + "\n\n".join(format_job(j, i) for i, j in enumerate(rows[:n], 1)) + more


HELP = """*Internship agent*. Ask me anything, in plain words:
• _backend internships in Bangalore_
• _remote ML roles posted this week_
• _which companies hire most in Austin?_
• _what's closing soon?_

Shortcuts:
*new*: roles that appeared in the last 24 hours
*alerts*: roles I sent you recently
*closing*: deadlines in the next 2 weeks
*soon*: companies about to open applications
*help*: this message"""


def _quick(text: str, jobs, openings):
    """Shortcut words that don't need the LLM. Returns a reply or None."""
    w = re.sub(r"[^a-z ]", "", text.lower()).strip()
    if w in ("help", "hi", "hello", "hey", "menu", "start"):
        return HELP
    if w in ("new", "whats new", "what is new", "latest"):
        return format_jobs(search(jobs, new_within_hours=24, hide_stale=True, sort="fit", limit=TOP), "🆕 New in the last 24 hours")
    if w in ("alerts", "alert", "sent", "whatsapp"):
        return format_jobs(search(jobs, alerted_only=True, sort="alerted", limit=TOP), "🔔 Recently sent to you")
    if w in ("closing", "deadlines", "deadline", "closing soon"):
        return format_jobs(search(jobs, closing_within_days=14, sort="closing", limit=TOP), "⏰ Closing within 2 weeks")
    if w in ("soon", "opening soon", "openings"):
        cal = market.calendar(openings or {}, jobs)
        rows = cal.get("soon", [])[:8]
        if not rows:
            return "No companies are due to open in the next two months."
        lines = [f"• {o['company']}: " + ("expected today" if o.get("days_until") == 0 else
                 f"in {o['days_until']} days" if o.get("days_until", 0) > 0 else "usually open by now") for o in rows]
        return "📅 Opening soon\n\n" + "\n".join(lines)
    return None


def answer(sender: str, text: str, jobs, meta, openings=None) -> str:
    """Reply for one incoming text message."""
    quick = _quick(text, jobs, openings)
    if quick:
        return quick
    now = time.time()
    hist = [h for h in _memory.get(sender, []) if now - h["t"] < MEMORY_TTL]
    msgs = [{"role": h["role"], "content": h["content"]} for h in hist] + [{"role": "user", "content": text}]
    try:
        out = llm.chat(msgs, jobs, meta, None, channel="whatsapp")
    except Exception as e:
        log.warning("llm failed: %s", e)
        return "I couldn't reach the AI right now. Try a shortcut instead:\n\n" + HELP
    reply = (out.get("reply") or "").strip() or "Here's what I found."
    reply = re.sub(r"\*\*(.+?)\*\*", r"*\1*", reply)                    # markdown bold -> WhatsApp bold
    reply = re.sub(r"^#+\s*", "", reply, flags=re.M)
    last = out.get("last") or {}
    if last.get("tool") == "search_internships" and last.get("results"):
        reply += "\n\n" + format_jobs(last, "*Top matches*")
    hist += [{"role": "user", "content": text, "t": now}, {"role": "assistant", "content": reply[:1500], "t": now}]
    _memory[sender] = hist[-MEMORY_TURNS:]
    return reply


# ── sending ──────────────────────────────────────────────────
def chunks(text: str, size=MAX_CHARS):
    text, out = text.strip(), []
    while len(text) > size:
        cut = text.rfind("\n\n", 0, size)
        cut = cut if cut > size // 2 else size
        out.append(text[:cut].strip())
        text = text[cut:].strip()
    return out + ([text] if text else [])


def send_text(to: str, text: str) -> bool:
    e = _env()
    ok = True
    for part in chunks(text):
        r = httpx.post(f"{GRAPH}/{VER}/{e['pnid']}/messages", timeout=20,
                       headers={"Authorization": f"Bearer {e['token']}"},
                       json={"messaging_product": "whatsapp", "to": to, "type": "text",
                             "text": {"body": part, "preview_url": False}})
        if r.status_code >= 300:
            log.warning("send failed %s: %s", r.status_code, r.text[:300])
            ok = False
    return ok


def process(payload: dict, jobs, meta, openings=None, send=send_text) -> int:
    """Handle a webhook payload (runs in the background after we've already answered Meta). Returns replies sent."""
    owners, n = _env()["owners"], 0
    for mid, sender, kind, text in extract(payload):
        if sender not in owners:
            log.info("ignored message from a number that isn't the owner (from ...%s; META_WA_TO ends ...%s)",
                     sender[-4:], ",".join(sorted(o[-4:] for o in owners)))
            continue
        if not _fresh(mid):
            continue
        if kind not in ("text", "interactive") or not text:
            send(sender, "I can read text messages. Type *help* to see what I can do.")
            n += 1
            continue
        if not _allowed(sender):
            send(sender, "That's a lot of messages this hour. Try again a bit later.")
            continue
        try:
            send(sender, answer(sender, text, jobs, meta, openings))
        except Exception:
            log.exception("reply failed")
            send(sender, "Something went wrong on my side. Try again in a minute.")
        n += 1
    return n
