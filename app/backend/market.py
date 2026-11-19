"""Per-listing and per-company signals: when companies open, how fresh a listing is, how crowded it is likely to be.

None of the job sources publish applicant counts, so `competition()` is an *estimate* from things that drive
volume (how well known the company is, where the role is, how long it has been up, how broad the title is).
The app always labels it as an estimate. A real count, when a source provides one (`applicants`), wins.
"""
from __future__ import annotations

import re
import statistics
import time
from datetime import date, datetime, timedelta

_SUFFIX = re.compile(r"\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|technologies|technology|labs?|group|holdings)\b\.?")


def company_key(name: str) -> str:            # keep in sync with agent/signals.py
    k = (name or "").lower().replace("&", " and ")
    k = re.sub(r"\(.*?\)", " ", k)
    k = _SUFFIX.sub(" ", k)
    return re.sub(r"[^a-z0-9]+", " ", k).strip()


# ── when companies open ─────────────────────────────────────
def _d(s):
    return date.fromisoformat(s) if s else None


def opening(openings: dict, company: str, today: date | None = None) -> dict | None:
    """This cycle's status for one company: open (with date), expected (with date + window), or late."""
    if not openings:
        return None
    rec = (openings.get("companies") or {}).get(company_key(company))
    if not rec:
        return None
    today = today or date.today()
    cyc = int(openings.get("cycle") or today.year + 1)
    cycles = rec.get("cycles") or {}
    clipped = set(rec.get("clipped") or [])
    history = [{"cycle": int(c), "date": d, "clipped": c in clipped} for c, d in sorted(cycles.items()) if int(c) < cyc]
    out = {"company": rec.get("name") or company, "cycle": cyc, "history": history}
    # past opening dates moved into this cycle's calendar (same day, shifted by the number of cycles)
    shifted = []
    for h in history:
        try:
            shifted.append(_d(h["date"]).replace(year=_d(h["date"]).year + (cyc - h["cycle"])))
        except ValueError:            # 29 Feb
            shifted.append(_d(h["date"]) + timedelta(days=365 * (cyc - h["cycle"])))
    pairs = [(s, h) for s, h in zip(shifted, history)]
    good = [s for s, h in pairs[-2:] if not h["clipped"]] or [s for s, _ in pairs[-2:]]   # the two latest seasons
    if good:
        spread = (max(good) - min(good)).days
        out["confidence"] = "high" if len(good) >= 2 and spread <= 21 else "medium" if spread <= 60 else "low"
    if good:
        mid = sorted(good)[len(good) // 2] if len(good) % 2 else min(good) + (max(good) - min(good)) / 2
        out["expected_on"] = mid.isoformat()
        out["window"] = [min(good).isoformat(), max(good).isoformat()]
    if str(cyc) in cycles:
        out["status"] = "open"
        out["opened_on"] = cycles[str(cyc)]
        if good:
            delta = (_d(out["opened_on"]) - _d(out["expected_on"])).days
            out["vs_usual_days"] = delta
    elif good:
        exp, latest = _d(out["expected_on"]), max(good)
        out["days_until"] = (exp - today).days
        out["status"] = "expected" if exp >= today else ("due" if today <= latest + timedelta(days=14) else "late")
    else:
        out["status"] = "unknown"
    return out


def calendar(openings: dict, jobs: list, today: date | None = None, watch=(), horizon=60) -> dict:
    """Companies opening soon (by their past pattern), ones that just opened, and the user's watch list."""
    today = today or date.today()
    if not openings:
        return {"cycle": None, "soon": [], "opened": [], "watching": []}
    open_roles: dict = {}
    for j in jobs:
        k = company_key(j.get("company"))
        open_roles[k] = open_roles.get(k, 0) + 1
    soon, opened = [], []
    for k, rec in (openings.get("companies") or {}).items():
        if len(rec.get("cycles") or {}) < 2 and str(openings.get("cycle")) not in (rec.get("cycles") or {}):
            continue                                  # need at least one past cycle to predict from
        o = opening(openings, rec.get("name") or k, today)
        if not o:
            continue
        o["open_roles"] = open_roles.get(k, 0)
        o["seasons"] = len(o["history"])
        if o["status"] in ("expected", "due") and -14 <= o.get("days_until", 999) <= horizon \
                and o["seasons"] >= 2 and o.get("confidence") in ("high", "medium"):
            soon.append(o)
        elif o["status"] == "open" and (today - _d(o["opened_on"])).days <= 21 and o["open_roles"]:
            opened.append(o)
    # upcoming first (soonest), then ones that are due now
    soon.sort(key=lambda o: (o["days_until"] < 0, abs(o["days_until"]), o.get("confidence") != "high"))
    opened.sort(key=lambda o: (o["opened_on"], o["open_roles"]), reverse=True)
    wk = {company_key(w): w for w in watch or []}
    watching = []
    for k, name in wk.items():
        o = opening(openings, name, today) or {"company": name, "status": "unknown", "history": []}
        o["open_roles"] = open_roles.get(k, 0)
        watching.append(o)
    return {"cycle": openings.get("cycle"), "soon": soon[:40], "opened": opened[:40], "watching": watching}


# ── freshness / ghost-listing score ─────────────────────────
def freshness(job: dict, now: float | None = None) -> dict:
    now = now or time.time()
    posted = job.get("posted") or job.get("first_seen")
    reposts = int(job.get("reposts") or 0)
    score, reasons = 100.0, []
    if not posted:
        score -= 10
        reasons.append({"ok": None, "text": "No posting date, so its age is unknown"})
        age = None
    else:
        age = max(0, int((now - posted) // 86400))
        if age <= 7:
            reasons.append({"ok": True, "text": f"Posted {'today' if age == 0 else f'{age} day' + ('s' if age > 1 else '') + ' ago'}"})
        elif age <= 30:
            score -= (age - 7) * 0.6
            reasons.append({"ok": True, "text": f"Up for {age} days, which is normal"})
        elif age <= 60:
            score -= 14 + (age - 30) * 0.8
            reasons.append({"ok": None, "text": f"Up for {age} days; many internship roles fill within a month or two"})
        else:
            score -= 38 + min(30, (age - 60) * 0.4)
            reasons.append({"ok": False, "text": f"Up for {age} days, much longer than most internship listings"})
    if reposts:
        score -= min(36, 12 * reposts)
        reasons.append({"ok": False, "text": f"Reposted {reposts} time{'s' if reposts > 1 else ''} after earlier versions closed"
                                             " (can mean an always-open pipeline rather than a real opening)"})
    score = max(0, round(score))
    label = "Fresh" if score >= 75 else "Active" if score >= 55 else "Getting stale" if score >= 35 else "Possible ghost listing"
    level = "fresh" if score >= 75 else "active" if score >= 55 else "stale" if score >= 35 else "ghost"
    return {"score": score, "label": label, "level": level, "age_days": age, "reposts": reposts, "reasons": reasons}


# ── competition estimate ───────────────────────────────────
TIER_A = {company_key(c) for c in """Google, Meta, Apple, Amazon, Microsoft, Netflix, NVIDIA, OpenAI, Anthropic, Stripe, Tesla, SpaceX,
Airbnb, Uber, Lyft, LinkedIn, Salesforce, Adobe, Snap, Pinterest, Databricks, Palantir, Coinbase, Robinhood, DoorDash, Spotify,
Jane Street, Citadel, Citadel Securities, Two Sigma, Hudson River Trading, Jump Trading, DE Shaw, Optiver, IMC, SIG, Susquehanna,
Goldman Sachs, Morgan Stanley, JPMorgan Chase, TikTok, ByteDance, Figma, Notion, Ramp, Scale AI, Atlassian, Intuit, Oracle, IBM,
Qualcomm, AMD, Intel, Cisco, PayPal, Bloomberg, Visa, Mastercard, Flipkart, Swiggy, Zomato, Razorpay, CRED, Zepto, Meesho, PhonePe""".replace("\n", " ").split(", ")}
HUBS = re.compile(r"san francisco|\bsf\b|bay area|mountain view|palo alto|menlo park|sunnyvale|san jose|santa clara|cupertino|redwood city|"
                  r"new york|\bnyc\b|seattle|bellevue|bengaluru|bangalore|hyderabad|mumbai|pune|gurgaon|gurugram|noida|delhi", re.I)
INDIA = re.compile(r"india|bengaluru|bangalore|hyderabad|mumbai|pune|chennai|gurgaon|gurugram|noida|delhi|kolkata|ahmedabad", re.I)
BROAD = re.compile(r"\b(software|swe|sde|developer|machine learning|ml|ai|data scien|full[- ]?stack|backend|frontend|product)\b", re.I)
NICHE = re.compile(r"\b(hardware|embedded|firmware|asic|fpga|rf|analog|quant|research|mechanical|electrical|manufacturing|chemical)\b", re.I)
LEVELS = ["very_low", "low", "fair", "good"]


def _nice(n):
    if n < 50:
        return max(5, int(round(n / 5) * 5))
    if n < 1000:
        return int(round(n / 50) * 50)
    return int(round(n / 500) * 500)


def competition(job: dict, fit: int | None = None, referred: bool = False, big_employers: set | None = None,
                now: float | None = None) -> dict:
    now = now or time.time()
    posted = job.get("posted") or job.get("first_seen") or now
    age = max(0.0, (now - posted) / 86400)
    k = company_key(job.get("company"))
    locs = " ".join(job.get("locations") or [])
    title = job.get("title") or ""
    real = job.get("applicants")
    if k in TIER_A:
        inflow, why = 260, "a very well-known company"
    elif big_employers and k in big_employers:
        inflow, why = 80, "a large employer"
    else:
        inflow, why = 25, "a smaller or less-known company"
    factors = [why]
    if job.get("remote") or "remote" in locs.lower():
        inflow *= 1.6
        factors.append("remote, so open to applicants anywhere")
    elif INDIA.search(locs):
        inflow *= 1.4
        factors.append("in India, where intern roles draw very large pools")
    elif HUBS.search(locs):
        inflow *= 1.2
        factors.append("in a major tech hub")
    if NICHE.search(title):
        inflow *= 0.6
        factors.append("a specialised title, which narrows the pool")
    elif BROAD.search(title):
        inflow *= 1.25
        factors.append("a broad title that many students apply to")
    if "Citizenship" in (job.get("sponsorship") or ""):
        inflow *= 0.7
    est = real if real else inflow * (min(age, 90) + 1) ** 0.75
    lo, hi = (real, real) if real else (_nice(est * 0.5), _nice(est * 1.6))
    base = 3 if est < 150 else 2 if est < 500 else 1 if est < 1500 else 0
    lift, boosts = 0, []
    if age <= 3:
        lift += 1
        boosts.append("You’re early: most reviewers start with the first applicants")
    if fit is not None and fit >= 80:
        lift += 1
        boosts.append("Your profile is a strong fit, which helps you pass keyword screens")
    if referred:
        lift += 2
        boosts.append("A referral usually puts your application in front of a person")
    cap = 3 if referred or k not in TIER_A else 2      # huge-name roles: never promise "good" without a referral
    level = LEVELS[min(cap, base + lift)]
    text = {"good": "Good chance a person reviews it", "fair": "Fair chance of a human review",
            "low": "Low chance of a human review", "very_low": "Very low chance without a referral"}[level]
    tips = []
    if not referred and level in ("low", "very_low"):
        tips.append("Ask for a referral first; it matters more than anything else here")
    if age > 14 and not real:
        tips.append("It has been up a while, so apply today if you’re going to")
    return {"estimated": not real, "low": lo, "high": hi, "age_days": round(age), "level": level, "text": text,
            "factors": factors, "boosts": boosts, "tips": tips}


def big_employers(jobs: list, min_listings=8) -> set:
    counts: dict = {}
    for j in jobs:
        kk = company_key(j.get("company"))
        counts[kk] = counts.get(kk, 0) + 1
    return {kk for kk, n in counts.items() if n >= min_listings}
