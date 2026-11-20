import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

import deadlines
from search import search


def test_find_deadlines():
    t = date(2026, 11, 19)
    assert deadlines.find("Apply by 5th Dec' 26", t) == date(2026, 12, 5)
    assert deadlines.find("Applications close on December 12, 2026. Start date June 1", t) == date(2026, 12, 12)
    assert deadlines.find("The deadline to apply is Jan 3", t) == date(2027, 1, 3)
    assert deadlines.find("Applications will close Nov 2", t) is None          # already passed
    assert deadlines.find("Reviewed on a rolling basis", t) is None
    assert deadlines.find("The internship starts 12 Dec.", t) is None          # no deadline phrase


def _job(i, closes=None, fit=70):
    j = {"id": f"j{i}", "title": "Software Engineer Intern", "company": f"Co{i}", "locations": ["Bengaluru, India"],
         "posted": int(time.time()) - 86400, "fit": {"score": fit}}
    if closes is not None:
        j["closes"] = int(time.time() + closes * 86400)
    return j


def test_closing_sort_and_filter():
    jobs = [_job(1), _job(2, closes=10), _job(3, closes=2), _job(4, closes=-2)]
    r = search(jobs, sort="closing", limit=10)
    ids = [x["id"] for x in r["results"]]
    assert ids[:2] == ["j3", "j2"] and "j4" not in ids                       # passed deadlines drop out
    r = search(jobs, closing_within_days=5, limit=10)
    assert [x["id"] for x in r["results"]] == ["j3"]
    assert r["results"][0]["closes_in"] in (1, 2)


def test_urgent_roles_rise_in_fit_order():
    jobs = [_job(1, fit=72), _job(2, closes=1, fit=68)]
    assert search(jobs, sort="fit", limit=10)["results"][0]["id"] == "j2"


def test_digest_build():
    from agent import email_digest as dg
    now = time.time()
    profile = {"skills": ["Python"], "roles": ["Backend"], "locations": ["Bengaluru"], "watch_companies": [],
               "digest_sent_at": None}
    apps = [{"job_id": "x", "company": "Acme", "title": "SWE Intern", "status": "Applied",
             "follow_up_on": (date.today() - timedelta(days=2)).isoformat(), "interview_at": None}]
    d = dg.build(profile, apps, [], {}, now)
    assert d["todo"] and d["todo"][0][0] == "Follow up" and "overdue" in d["todo"][0][2]
    assert not dg.empty(d) and "follow-ups due" in dg.subject(d)
    html = dg.render("Raghav Venkat", d)
    assert "Morning, Raghav" in html and "Acme" in html


def test_keyword_find():
    import find
    jobs = [
        {"id": "a", "title": "Software Development Engineer Intern", "company": "Amazon", "locations": ["Seattle, WA"]},
        {"id": "b", "title": "Machine Learning Intern", "company": "Acme", "locations": ["Bangalore"]},
        {"id": "c", "title": "Backend Intern", "company": "Stripe", "locations": ["Remote"], "remote": True},
        {"id": "d", "title": "Marketing Intern", "company": "Foo", "locations": ["Bangalore"]},
    ]
    assert [r["id"] for r in find.find(jobs, "sde", hide_stale=False)["results"]] == ["a"]
    r = find.find(jobs, "ml intern bangalore", hide_stale=False)
    assert [x["id"] for x in r["results"]] == ["b"] and r["places"] == ["bangalore"]
    assert [x["id"] for x in find.find(jobs, "stripe", hide_stale=False)["results"]] == ["c"]
    assert [x["id"] for x in find.find(jobs, "remote", hide_stale=False)["results"]] == ["c"]
    assert find.find(jobs, "zzqx", hide_stale=False)["unknown"] == ["zzqx"]
    assert find.suggest(jobs, "mach")[0]["text"] == "Machine Learning Intern"


def test_new_alerted_and_exclude_filters():
    now = time.time()
    jobs = [dict(_job(1), first_seen=now - 3600, alerted=now - 600), dict(_job(2), first_seen=now - 5 * 86400),
            dict(_job(3), first_seen=now - 7200)]
    r = search(jobs, new_within_hours=48, sort="found", limit=10)
    assert [x["id"] for x in r["results"]] == ["j1", "j3"]
    assert [x["id"] for x in search(jobs, alerted_only=True, limit=10)["results"]] == ["j1"]
    assert "j1" not in [x["id"] for x in search(jobs, exclude_ids=["j1"], limit=10)["results"]]
