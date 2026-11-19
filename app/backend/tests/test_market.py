"""Opening-date predictions, freshness and competition estimates."""
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import market  # noqa: E402

OPEN = {"cycle": "2027", "companies": {
    "stripe": {"name": "Stripe", "cycles": {"2025": "2024-08-23", "2026": "2025-09-03"}},
    "meta": {"name": "Meta", "cycles": {"2025": "2024-09-28", "2026": "2025-08-22", "2027": "2026-10-06"}},
    "wobbly": {"name": "Wobbly", "cycles": {"2025": "2024-02-01", "2026": "2025-11-01"}},
}}


def test_opening_expected_and_open():
    o = market.opening(OPEN, "Stripe, Inc.", today=date(2026, 8, 1))
    assert o["status"] == "expected" and o["confidence"] == "high"
    assert "2026-08-23" <= o["expected_on"] <= "2026-09-03" and o["days_until"] > 0
    m = market.opening(OPEN, "Meta", today=date(2026, 11, 19))
    assert m["status"] == "open" and m["opened_on"] == "2026-10-06" and m["vs_usual_days"] == 27
    late = market.opening(OPEN, "Stripe", today=date(2026, 11, 19))
    assert late["status"] == "late"
    assert market.opening(OPEN, "Wobbly", today=date(2026, 1, 1))["confidence"] == "low"


def test_calendar_lists():
    jobs = [{"company": "Meta"}, {"company": "Meta"}]
    cal = market.calendar(OPEN, jobs, today=date(2026, 8, 10), watch=["Meta", "Unknown Co"])
    assert [o["company"] for o in cal["soon"]] == ["Stripe"]
    w = {o["company"]: o for o in cal["watching"]}
    assert w["Meta"]["open_roles"] == 2 and w["Unknown Co"]["status"] == "unknown"


def test_freshness_levels():
    now = time.time()
    assert market.freshness({"posted": now - 2 * 86400}, now)["level"] == "fresh"
    old = market.freshness({"posted": now - 120 * 86400, "reposts": 2}, now)
    assert old["level"] == "ghost" and any("Reposted 2 times" in r["text"] for r in old["reasons"])


def test_competition_estimate_and_caps():
    now = time.time()
    big = market.competition({"company": "Google", "title": "Software Engineering Intern", "locations": ["Bengaluru, India"],
                              "posted": now - 20 * 86400}, fit=90, now=now)
    assert big["estimated"] and big["high"] > big["low"] >= 1000 and big["level"] in ("very_low", "low", "fair")
    early = market.competition({"company": "Google", "title": "SWE Intern", "locations": ["Austin, TX"], "posted": now}, fit=90, now=now)
    assert early["level"] != "good"                       # never "good" for a huge name without a referral
    ref = market.competition({"company": "Google", "title": "SWE Intern", "locations": ["Austin, TX"], "posted": now}, referred=True, now=now)
    assert ref["level"] == "good"
    small = market.competition({"company": "Tiny Robotics", "title": "Embedded Firmware Intern", "locations": ["Boise, ID"],
                                "posted": now - 3 * 86400}, now=now)
    assert small["high"] < 150 and small["level"] == "good"
    real = market.competition({"company": "X", "title": "Intern", "applicants": 312, "posted": now}, now=now)
    assert not real["estimated"] and real["low"] == real["high"] == 312
