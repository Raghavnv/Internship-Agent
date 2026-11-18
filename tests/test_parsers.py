"""Offline tests for the source parsers and matcher (python -m pytest tests)."""
import time
from unittest import mock

import yaml

from agent import sources
from agent.matcher import Matcher


class R:
    def __init__(self, data=None, text=""):
        self._d, self.text, self.status_code = data, text, 200
    def json(self): return self._d
    def raise_for_status(self): pass


def cfg():
    return yaml.safe_load(open("config.yaml"))


def test_greenhouse():
    data = {"jobs": [
        {"id": 1, "title": "Software Engineering Intern", "absolute_url": "https://x/1",
         "location": {"name": "Bengaluru, India"}, "updated_at": "2026-11-16T10:00:00-05:00"},
        {"id": 2, "title": "Senior Backend Engineer", "absolute_url": "https://x/2",
         "location": {"name": "Bengaluru"}, "updated_at": "2026-11-16T10:00:00Z"}]}
    with mock.patch.object(sources, "_get", return_value=R(data)):
        jobs = sources.fetch_greenhouse("stripe")
    assert len(jobs) == 1 and jobs[0]["locations"] == ["Bengaluru, India"] and jobs[0]["posted"]


def test_lever():
    data = [{"id": "a", "text": "Backend Intern", "hostedUrl": "https://l/a", "createdAt": 1794873600000,
             "categories": {"location": "Bangalore", "commitment": "Internship"}, "workplaceType": "onsite"},
            {"id": "b", "text": "Product Designer", "hostedUrl": "https://l/b",
             "categories": {"location": "Bangalore", "commitment": "Full-time"}}]
    with mock.patch.object(sources, "_get", return_value=R(data)):
        jobs = sources.fetch_lever("cred")
    assert [j["title"] for j in jobs] == ["Backend Intern"]


def test_ashby():
    data = {"jobs": [{"id": "z", "title": "AI Research Intern", "location": "Bengaluru",
                      "isRemote": False, "jobUrl": "https://a/z", "publishedAt": "2026-11-15T00:00:00.000+00:00",
                      "employmentType": "Intern", "secondaryLocations": [{"location": "Remote - India"}]}]}
    with mock.patch.object(sources, "_get", return_value=R(data)):
        jobs = sources.fetch_ashby("sarvam")
    assert jobs[0]["locations"] == ["Bengaluru", "Remote - India"]


HTML = """<div class="container-fluid individual_internship" internshipid="111">
 <h3 class="job-internship-name"><a class="job-title-href" href="/internship/detail/ml-intern-111">Machine Learning</a></h3>
 <p class="company-name">Acme AI Labs</p><div class="row-1-item locations"><span><a>Work from home</a></span></div>
 <span class="stipend">₹ 15,000 /month</span></div>
<div class="container-fluid individual_internship" internshipid="222">
 <h3><a class="job-title-href" href="/internship/detail/x-222">Python Development</a></h3>
 <p class="company-name">Shady Co</p><div class="locations"><a>Bangalore</a></div>
 <span class="stipend">₹ 2,000 /month</span><p>Registration fee of Rs 999 applies</p></div>"""


def test_internshala_and_scam_filter():
    with mock.patch.object(sources, "_get", return_value=R(text=HTML)), \
         mock.patch.object(sources, "INTERNSHALA_PAGES", ["https://internshala.com/internships/work-from-home-x/"]), \
         mock.patch.object(sources.time, "sleep"):
        jobs = sources.fetch_internshala()
    assert len(jobs) == 2
    m = Matcher(cfg())
    ev = m.evaluate(jobs[0])
    assert ev and ev["bucket"] == "remote" and m.is_instant(jobs[0], ev)
    assert m.evaluate(jobs[1]) is None  # registration fee -> dropped


def job(title, locs, terms=("Summer 2027",), **kw):
    return {"id": title, "source": "Simplify", "company": "Google", "title": title, "url": "u",
            "locations": list(locs), "terms": list(terms), "remote": False, "posted": time.time(), **kw}


def test_matcher_rules():
    m = Matcher(cfg())
    assert m.evaluate(job("Software Engineer Intern", ["Austin, TX"]))
    assert m.evaluate(job("Frontend Engineer Intern", ["Austin, TX"])) is None
    assert m.evaluate(job("Full Stack (Frontend + Backend) Intern", ["Austin, TX"]))
    assert m.evaluate(job("Software Engineer Intern", ["Austin, TX"], terms=["Spring 2027"])) is None  # onsite in semester
    assert m.evaluate(job("Software Engineer Intern", ["Remote in USA"], terms=["Spring 2027"]))
    assert m.evaluate(job("Software Engineer Intern", ["London, UK"])) is None
    assert m.evaluate(job("Hardware Engineer Intern", ["Austin, TX"])) is None
    assert m.evaluate(job("Research Scientist Intern", ["SF"], degrees=["PhD"])) is None
    ev = m.evaluate(job("Software Engineer Intern", ["Dallas, TX"], sponsorship="Does Not Offer Sponsorship"))
    assert ev and any("sponsorship" in t for t in ev["tags"])
    assert m.evaluate(job("Maintenance Intern", ["Austin, TX"])) is None  # 'ai' must be a whole word


def test_aisensy_payloads(monkeypatch):
    from agent import notify
    sent = []
    monkeypatch.setattr(notify.requests, "post", lambda url, json=None, **k: sent.append((url, json)) or R({}))
    monkeypatch.setattr(notify.time, "sleep", lambda s: None)
    for k, v in {"AISENSY_API_KEY": "k", "AISENSY_JOB_CAMPAIGN": "job_alert", "AISENSY_TEXT_CAMPAIGN": "agent_update",
                 "AISENSY_DESTINATION": "+91 8762537925"}.items():
        monkeypatch.setenv(k, v)
    n = notify.Notifier()
    assert n.channels() == ["aisensy"]
    m = Matcher(cfg())
    j = job("Backend Software Engineer Intern", ["Austin, TX", "Dallas, TX"])
    n.send_jobs("🔥 New", [(j, m.evaluate(j))], 3)
    n.send("🚀 *Live!*\nline two\n\nline three")
    (u1, p1), (u2, p2) = sent
    assert u1.endswith("/campaign/t1/api/v2") and p1["campaignName"] == "job_alert"
    assert p1["destination"] == "918762537925" and len(p1["templateParams"]) == 5
    assert all("\n" not in x and "    " not in x for x in p1["templateParams"])
    assert p2["campaignName"] == "agent_update" and p2["templateParams"] == ["🚀 Live! | line two | line three"]


def test_meta_text_then_template_fallback(monkeypatch):
    from agent import notify
    calls = []

    class Resp:
        def __init__(self, code, text=""):
            self.status_code, self.text = code, text

    def fake_post(url, json=None, headers=None, **k):
        calls.append(json)
        if json["type"] == "text":  # window closed
            return Resp(400, '{"error":{"code":131047,"message":"Re-engagement message"}}')
        return Resp(200, "{}")

    monkeypatch.setattr(notify.requests, "post", fake_post)
    monkeypatch.setattr(notify.time, "sleep", lambda s: None)
    for k, v in {"META_WA_TOKEN": "t", "META_WA_PHONE_NUMBER_ID": "123", "META_WA_TO": "+918762537925"}.items():
        monkeypatch.setenv(k, v)
    n = notify.Notifier()
    assert n.channels() == ["meta"]
    m = Matcher(cfg())
    a, b = job("Backend Intern", ["Austin, TX"]), job("ML Engineer Intern", ["SF"])
    n.send_jobs("🔥 New", [(a, m.evaluate(a)), (b, m.evaluate(b))], 3)
    assert [c["type"] for c in calls] == ["text", "template", "template"]
    t = calls[1]["template"]
    assert t["name"] == "job_alert" and len(t["components"][0]["parameters"]) == 5 and calls[1]["to"] == "918762537925"
    calls.clear()
    n.send_jobs("📰 Digest", [(a, m.evaluate(a)), (b, m.evaluate(b))], 3, compact_fallback=True)
    assert [c["type"] for c in calls] == ["text", "template"] and calls[1]["template"]["name"] == "agent_update"
