import hashlib
import hmac
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import llm
import whatsapp as wa

META = {"count": 3, "updated": 0, "updated_human": "now"}
NOW = int(time.time())
JOBS = [
    {"id": "a", "title": "Backend Intern", "company": "Acme", "locations": ["Bengaluru, India"], "terms": ["Summer 2027"],
     "url": "https://x/a", "posted": NOW - 3600, "first_seen": NOW - 3600, "fit": {"score": 88}},
    {"id": "b", "title": "ML Intern", "company": "Beta", "locations": ["Austin, TX"], "terms": [],
     "url": "https://x/b", "posted": NOW - 90 * 86400, "first_seen": NOW - 90 * 86400, "alerted": NOW - 100, "fit": {"score": 70}},
    {"id": "c", "title": "SWE Intern", "company": "Gamma", "locations": ["Remote"], "terms": ["Fall 2027"],
     "url": "https://x/c", "posted": NOW - 5 * 86400, "first_seen": NOW - 5 * 86400, "closes": NOW + 5 * 86400},
]


def payload(text, sender="918762537925", mid="m1", kind="text"):
    msg = {"id": mid, "from": sender, "type": kind}
    if kind == "text":
        msg["text"] = {"body": text}
    return {"entry": [{"changes": [{"value": {"messages": [msg]}}]}]}


def setup(monkeypatch):
    monkeypatch.setenv("META_WA_TOKEN", "t")
    monkeypatch.setenv("META_WA_PHONE_NUMBER_ID", "1")
    monkeypatch.setenv("META_WA_TO", "+91 87625 37925")
    wa._seen.clear(); wa._rate.clear(); wa._memory.clear()
    sent = []
    return sent, lambda to, text: sent.append((to, text)) or True


def test_signature_and_handshake(monkeypatch):
    monkeypatch.setenv("META_APP_SECRET", "s3cret")
    monkeypatch.setenv("META_WA_VERIFY_TOKEN", "hello")
    body = b'{"a":1}'
    good = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert wa.signature_ok(body, good)
    assert not wa.signature_ok(body, "sha256=" + "0" * 64) and not wa.signature_ok(body, None)
    monkeypatch.delenv("META_APP_SECRET")
    assert not wa.signature_ok(body, good)                      # no secret configured: refuse everything
    assert wa.verify_challenge("subscribe", "hello", "123") == "123"
    assert wa.verify_challenge("subscribe", "nope", "123") is None


def test_shortcuts_answer_without_the_llm(monkeypatch):
    sent, send = setup(monkeypatch)
    monkeypatch.setattr(llm, "chat", lambda *a, **k: (_ for _ in ()).throw(AssertionError("LLM not needed")))
    for i, word in enumerate(["new", "alerts", "closing", "help"]):
        wa.process(payload(word, mid=f"m{i}"), JOBS, META, {}, send=send)
    texts = [t for _, t in sent]
    assert "Backend Intern" in texts[0] and "ML Intern" not in texts[0]            # only what appeared in 24h
    assert "ML Intern" in texts[1] and "https://x/b" in texts[1]                    # sent to WhatsApp, even though old
    assert "SWE Intern" in texts[2] and "closes in" in texts[2]
    assert "Internship agent" in texts[3]


def test_free_text_uses_llm_and_appends_links(monkeypatch):
    sent, send = setup(monkeypatch)
    seen = {}

    def fake_chat(msgs, jobs, meta, profile=None, channel="web"):
        seen["channel"], seen["msgs"] = channel, msgs
        return {"reply": "Found 1 backend role.", "steps": [], "last": {"tool": "search_internships", "total": 1,
                "results": [{"title": "Backend Intern", "company": "Acme", "locations": ["Bengaluru"], "terms": [],
                             "url": "https://x/a", "fit": 88, "closes_in": None}]}}
    monkeypatch.setattr(llm, "chat", fake_chat)
    wa.process(payload("backend in bangalore"), JOBS, META, {}, send=send)
    wa.process(payload("and remote ones?", mid="m2"), JOBS, META, {}, send=send)
    assert seen["channel"] == "whatsapp" and len(seen["msgs"]) == 3                 # follow-up carries the earlier turn
    assert "Found 1 backend role." in sent[0][1] and "https://x/a" in sent[0][1]


def test_only_the_owner_gets_answers_and_messages_are_answered_once(monkeypatch):
    sent, send = setup(monkeypatch)
    assert wa.process(payload("new", sender="919999999999"), JOBS, META, {}, send=send) == 0
    assert wa.process(payload("new", mid="same"), JOBS, META, {}, send=send) == 1
    assert wa.process(payload("new", mid="same"), JOBS, META, {}, send=send) == 0   # Meta retry
    wa.process(payload("", kind="audio", mid="m9"), JOBS, META, {}, send=send)
    assert "text messages" in sent[-1][1] and len(sent) == 2


def test_long_replies_are_split():
    parts = wa.chunks("\n\n".join(["x" * 900] * 8))
    assert len(parts) >= 2 and all(len(p) <= wa.MAX_CHARS for p in parts)
