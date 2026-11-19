"""Job descriptions + fit explanations (no network: ATS calls are faked)."""
import os
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
os.environ.setdefault("ALLOW_LOCAL_AUTH", "1")
os.environ.setdefault("DATA_FILE", str(HERE / "sample_jobs.json"))

from fastapi.testclient import TestClient  # noqa: E402

import fit  # noqa: E402
import jobdetail  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)


def test_html_blocks_headings_bullets_and_escaped_html():
    raw = ("&lt;p&gt;&lt;strong&gt;What you'll do&lt;/strong&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Build APIs&lt;/li&gt;"
           "&lt;li&gt;Ship &lt;b&gt;fast&lt;/b&gt;&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;&lt;strong&gt;Note:&lt;/strong&gt; we hire across India.&lt;/p&gt;"
           "&lt;script&gt;alert(1)&lt;/script&gt;")
    b = jobdetail.html_blocks(raw)
    assert b[0] == {"type": "h", "text": "What you'll do"}
    assert {"type": "li", "text": "Build APIs"} in b and {"type": "li", "text": "Ship fast"} in b
    assert {"type": "p", "text": "Note: we hire across India."} in b
    assert not any("alert" in x["text"] for x in b)


def test_provider_detection():
    assert jobdetail.provider("https://job-boards.greenhouse.io/acme/jobs/123")[0] == "Greenhouse"
    assert jobdetail.provider("https://jobs.lever.co/acme/abc-def")[0] == "Lever"
    assert jobdetail.provider("https://jobs.ashbyhq.com/acme/uuid/application")[0] == "Ashby"
    assert jobdetail.provider("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternal/job/Santa-Clara/Intern_JR1")[0] == "Workday"
    assert jobdetail.provider("https://www.tesla.com/careers/123")[0] is None


def test_workday_and_greenhouse_urls(monkeypatch):
    seen = []

    def fake_get(url, **kw):
        seen.append(url)
        if "greenhouse" in url:
            return {"content": "&lt;p&gt;Hello&lt;/p&gt;"}
        return {"jobPostingInfo": {"jobDescription": "<p>Build GPUs</p>"}}
    monkeypatch.setattr(jobdetail, "_get", fake_get)
    jobdetail._cache.clear()
    d = jobdetail.description("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternal/job/Santa-Clara-CA/Intern_JR1")
    assert d == {"blocks": [{"type": "p", "text": "Build GPUs"}], "from": "Workday"}
    assert seen[-1] == "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternal/job/Santa-Clara-CA/Intern_JR1"
    assert jobdetail.description("https://boards.greenhouse.io/acme/jobs/42")["blocks"][0]["text"] == "Hello"
    assert seen[-1] == "https://boards-api.greenhouse.io/v1/boards/acme/jobs/42"


def test_failed_fetch_returns_none(monkeypatch):
    import httpx

    def boom(url, **kw):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(jobdetail, "_get", boom)
    jobdetail._cache.clear()
    assert jobdetail.description("https://jobs.lever.co/acme/x") is None


def test_explain():
    p = fit.prepare({"roles": ["Backend"], "skills": ["Python"], "locations": ["Austin"], "us_work_auth": "needs_sponsorship",
                     "onsite_from": "2027-06-01", "onsite_to": "2027-09-28"})
    job = {"title": "Backend Engineer Intern (Python)", "locations": ["Austin, TX"], "terms": ["Summer 2027"],
           "degrees": ["Bachelor's"], "sponsorship": "Does Not Offer Sponsorship"}
    checks = fit.explain(job, p)
    texts = [c["text"] for c in checks]
    assert any("Backend" in t for t in texts) and any("Python" in t for t in texts)
    assert any(c["ok"] and "Austin" in c["text"] for c in checks)
    assert any(c["ok"] is False and "sponsorship" in c["text"] for c in checks)


def test_job_endpoint(monkeypatch):
    monkeypatch.setattr(jobdetail, "description", lambda url: {"blocks": [{"type": "p", "text": "Desc"}], "from": "Greenhouse"})
    jid = main.store.get()[0]["id"]
    r = client.post("/api/job", json={"id": jid, "profile": {"roles": ["Software Engineering"], "locations": ["Remote"]}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job"]["id"] == jid and isinstance(body["checks"], list) and body["description"]["blocks"][0]["text"] == "Desc"
    assert client.post("/api/job", json={"id": "nope"}).status_code == 404


def test_insights():
    r = client.post("/api/insights", json={"profile": {"roles": ["Software Engineering"], "locations": ["Remote"]}})
    assert r.status_code == 200, r.text
    b = r.json()
    assert len(b["by_day"]) == 30 and len(b["fit_bins"]) == 5
    assert b["total"] >= 0 and isinstance(b["companies"], list)
    assert sum(b["fit_bins"]) <= b["total"] and b["remote"] + b["onsite"] == b["total"]


def test_terms_and_tailor_without_llm(monkeypatch):
    import coach
    jd = "We use Python, FastAPI and PostgreSQL on AWS. Experience with Kafka and Docker is a plus. Grade C or above."
    t = coach.terms_in(jd)
    assert {"Python", "FastAPI", "PostgreSQL", "AWS", "Kafka", "Docker"} <= set(t) and "C" not in t

    def no_llm(*a, **k):
        raise RuntimeError("no key")
    monkeypatch.setattr(coach.resume_ai, "_complete", no_llm)
    p = {"skills": ["Python", "FastAPI"], "experience": [{"title": "Intern", "company": "Sensesys", "bullets": ["Built APIs with PostgreSQL"]}]}
    out = coach.tailor({"title": "Backend Intern", "company": "Acme"}, jd, p)
    assert {"Python", "FastAPI", "PostgreSQL"} <= set(out["matched"]) and "Kafka" in out["missing"]
    assert out["coverage"] and "error" in out


def test_tailor_keeps_only_real_bullets(monkeypatch):
    import coach, json as _j
    monkeypatch.setattr(coach.resume_ai, "_complete", lambda *a, **k: _j.dumps({
        "summary": "Backend-focused CS student", "bullets": [{"id": 0, "rewritten": "Built REST APIs on PostgreSQL", "why": "Backend"},
                                                            {"id": 9, "rewritten": "Invented", "why": "x"}], "advice": ["Add Kafka"]}))
    p = {"experience": [{"title": "Intern", "company": "Sensesys", "bullets": ["Built APIs with PostgreSQL"]}]}
    out = coach.tailor({"title": "Backend Intern", "company": "Acme"}, "Python PostgreSQL", p)
    assert len(out["bullets"]) == 1 and out["bullets"][0]["original"] == "Built APIs with PostgreSQL"


def test_referral_endpoint_fallback(monkeypatch):
    import coach

    def no_llm(*a, **k):
        raise RuntimeError("no key")
    monkeypatch.setattr(coach.resume_ai, "_complete", no_llm)
    jid = main.store.get()[0]["id"]
    r = client.post("/api/referral", json={"id": jid, "profile": {"full_name": "Raghav Venkat", "college": "RV College of Engineering"}})
    assert r.status_code == 200, r.text
    b = r.json()
    assert len(b["note"]) <= 300 and "RV College" in b["note"] and "[Name]" in b["message"]
