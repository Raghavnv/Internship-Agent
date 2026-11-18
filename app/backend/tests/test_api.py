"""API tests with a fake LLM (no network). Run: DATA_FILE=tests/sample_jobs.json python -m pytest -q"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
os.environ.setdefault("DATA_FILE", str(HERE / "sample_jobs.json"))
os.environ["LLM_API_KEY"] = "test"

from fastapi.testclient import TestClient  # noqa: E402

import llm  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)


class FakeResp:
    def __init__(self, data, code=200):
        self._d, self.status_code, self.text = data, code, json.dumps(data)

    def json(self):
        return self._d


def fake_llm(script):
    """script: list of assistant messages to return in order."""
    calls = []

    def post(url, json=None, headers=None, timeout=None):
        calls.append(json)
        return FakeResp({"choices": [{"message": script[len(calls) - 1]}]})
    return post, calls


def tool_call(name, args, cid="c1"):
    return {"role": "assistant", "content": None,
            "tool_calls": [{"id": cid, "type": "function",
                            "function": {"name": name, "arguments": json.dumps(args)}}]}


def test_health_and_meta():
    assert client.get("/api/health").json()["ok"]
    m = client.get("/api/meta").json()
    assert m["count"] == 4 and "companies" in m


def test_search_endpoint_filters():
    r = client.post("/api/search", json={"any_keywords": ["backend"], "locations": ["texas"]}).json()
    assert r["total"] == 1 and r["results"][0]["company"] == "PayPal"
    r = client.post("/api/search", json={"locations": ["bay area"], "start_month": "2027-06",
                                          "end_month": "2027-09"}).json()
    assert [x["company"] for x in r["results"]] == ["NVIDIA"]
    r = client.post("/api/search", json={"remote": "only", "start_month": "2027-01", "end_month": "2027-04"}).json()
    assert [x["company"] for x in r["results"]] == ["Acme AI"]
    r = client.post("/api/search", json={"locations": ["bangalore"]}).json()
    assert r["total"] == 1 and r["results"][0]["company"] == "Sarvam"


def test_chat_runs_tool_then_answers(monkeypatch):
    post, calls = fake_llm([
        tool_call("search_internships", {"any_keywords": ["backend", "software engineer"],
                                         "locations": ["dallas", "austin"], "terms": ["Summer 2027"],
                                         "bogus": 1}),
        {"role": "assistant", "content": "Found 1 backend role in Texas: PayPal in Austin."},
    ])
    monkeypatch.setattr(llm.httpx, "post", post)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "backend jobs in texas summer"}]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["reply"].startswith("Found 1")
    assert d["last"]["total"] == 1 and d["last"]["results"][0]["url"].startswith("https://")
    assert "bogus" not in d["steps"][0]["args"]
    # the model got the tool output back, with tools offered and a system prompt with today's date
    assert calls[1]["messages"][-1]["role"] == "tool" and calls[0]["tools"]
    assert "Today is" in calls[0]["messages"][0]["content"]


def test_chat_count_tool(monkeypatch):
    post, _ = fake_llm([tool_call("count_internships", {"group_by": "company"}),
                        {"role": "assistant", "content": "4 companies, 1 role each."}])
    monkeypatch.setattr(llm.httpx, "post", post)
    d = client.post("/api/chat", json={"messages": [{"role": "user", "content": "who hires most?"}]}).json()
    assert d["last"]["tool"] == "count_internships" and d["last"]["total"] == 4


PROFILE = {"full_name": "Asha", "skills": ["Python"], "roles": ["Backend"], "locations": ["Austin"],
           "work_modes": ["onsite"], "onsite_from": "2027-06-01", "onsite_to": "2027-08-31"}


def test_search_scores_for_the_given_profile():
    r = client.post("/api/search", json={"profile": PROFILE, "sort": "fit", "limit": 4}).json()
    assert r["results"][0]["company"] == "PayPal" and r["results"][0]["fit"] >= 70
    other = client.post("/api/search", json={"profile": {"roles": ["AI / ML"], "locations": ["bay area"]},
                                             "sort": "fit"}).json()
    assert other["results"][0]["company"] == "NVIDIA"


def test_chat_uses_profile_in_prompt(monkeypatch):
    post, calls = fake_llm([{"role": "assistant", "content": "Hi Asha"}])
    monkeypatch.setattr(llm.httpx, "post", post)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}], "profile": PROFILE})
    assert r.status_code == 200
    assert "Asha" in calls[0]["messages"][0]["content"] and "Backend" in calls[0]["messages"][0]["content"]


def test_auth_required_when_supabase_configured(monkeypatch):
    import auth

    class R:
        def __init__(self, code, data):
            self.status_code, self._d = code, data

        def json(self):
            return self._d

    monkeypatch.setattr(auth, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(auth.httpx, "get", lambda url, headers=None, timeout=None:
                        R(200, {"id": "u1", "email": "a@b.c"}) if headers["Authorization"] == "Bearer good" else R(401, {}))
    auth._cache.clear()
    assert client.post("/api/search", json={}).status_code == 401
    assert client.post("/api/search", json={}, headers={"Authorization": "Bearer bad"}).status_code == 401
    assert client.post("/api/search", json={}, headers={"Authorization": "Bearer good"}).status_code == 200
    assert client.get("/api/meta").status_code == 200  # landing page data stays public


def test_resume_parse_and_review(monkeypatch):
    from io import BytesIO
    from reportlab.pdfgen import canvas
    buf = BytesIO()
    c = canvas.Canvas(buf)
    for i, line in enumerate(["Asha Rao", "B.Tech Computer Science, RV College of Engineering, 2028",
                              "Skills: Python, FastAPI, PostgreSQL, React", "Built a RAG chatbot with LLMs"]):
        c.drawString(72, 760 - i * 18, line)
    c.save()
    post, calls = fake_llm([
        {"role": "assistant", "content": '{"full_name": "Asha Rao", "skills": ["Python", "FastAPI"], "roles": ["Backend"], "grad_year": "2028", "bogus": 1}'},
        {"role": "assistant", "content": "**Match**: 80/100"},
    ])
    monkeypatch.setattr(llm.httpx, "post", post)
    import resume
    monkeypatch.setattr(resume.httpx, "post", post)
    r = client.post("/api/resume/parse", files={"file": ("cv.pdf", buf.getvalue(), "application/pdf")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "FastAPI" in d["text"] and d["profile"]["grad_year"] == 2028 and "bogus" not in d["profile"]
    bad = client.post("/api/resume/parse", files={"file": ("x.pdf", b"hello", "application/pdf")})
    assert bad.status_code == 415
    rv = client.post("/api/resume/review", json={"resume_text": d["text"] * 2, "job": {"title": "Backend Intern"}})
    assert rv.status_code == 200 and rv.json()["review"].startswith("**Match**")


def test_geocode():
    assert client.get("/api/geocode", params={"q": "Austin, TX"}).json()["city"] == "Austin"
    assert client.get("/api/geocode", params={"q": "Remote"}).status_code == 404


def test_clean_profile_rejects_bad_ai_output():
    from resume import clean_profile
    out = clean_profile({
        "full_name": "  Asha   Rao ", "linkedin": "not a url !!", "github": "github.com/asha",
        "education": [{"school": "RVCE", "degree": "B.Tech", "field": "CS", "end": "2028"}],
        "experience": [{"company": "Acme", "title": "Intern", "bullets": ["a", "b", "c", "d", "e"]}, {"company": "", "title": "x"}],
        "skills": ["Python", "python", "SQL"], "roles": ["Backend", "Wizard"],
        "achievements": [{"title": "Won", "year": 3000}], "evil": "<script>",
    })
    assert out["full_name"] == "Asha Rao" and "linkedin" not in out and out["github"] == "https://github.com/asha"
    assert out["college"] == "RVCE" and out["grad_year"] == 2028 and out["degree_level"] == "bachelors"
    assert len(out["experience"]) == 1 and len(out["experience"][0]["bullets"]) == 4
    assert out["skills"] == ["Python", "SQL"] and out["roles"] == ["Backend"]
    assert out["achievements"][0]["year"] is None and "evil" not in out


def test_profile_summary_mentions_experience():
    from fit import profile_summary
    s = profile_summary({"full_name": "Asha", "experience": [{"title": "Backend Intern", "company": "Acme"}]})
    assert "Backend Intern at Acme" in s
