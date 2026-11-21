"""Per-user fit score (0-100) from a profile filled in during onboarding.

profile keys (all optional): skills[], roles[], avoid_roles[], locations[], work_modes[],
remote_from/remote_to/onsite_from/onsite_to ("YYYY-MM-DD"), degree_level, us_work_auth, paid_only.
"""
from __future__ import annotations

import re
import time

from search import REMOTE_RE, location_matchers, loc_country, term_months, word_re

# Interest areas offered in onboarding -> title keywords ("*" = prefix match)
ROLE_KEYWORDS = {
    "Software Engineering": ["software engineer*", "software develop*", "swe", "sde", "developer"],
    "Backend": ["backend", "back-end", "back end", "api", "platform", "server", "distributed"],
    "Full Stack": ["full stack", "full-stack", "fullstack", "web develop*"],
    "Frontend": ["frontend", "front-end", "front end", "ui engineer", "react"],
    "AI / ML": ["machine learning", "ml", "ai", "deep learning", "llm", "genai", "nlp", "computer vision", "applied scien*"],
    "Data Science": ["data scien*", "data analy*", "analytics", "statistic*"],
    "Data Engineering": ["data engineer*", "etl", "data platform", "pipeline"],
    "Mobile": ["mobile", "ios", "android", "flutter", "react native"],
    "DevOps / Cloud": ["devops", "cloud", "site reliability", "sre", "infrastructure", "kubernetes"],
    "Security": ["security", "cyber", "appsec", "infosec"],
    "Research": ["research"],
    "Product": ["product manag*", "product intern", "apm"],
    "Quant": ["quant*", "trading", "trader"],
    "Hardware / Embedded": ["hardware", "embedded", "firmware", "fpga", "asic", "electrical"],
    "Design / UX": ["design", "ux", "ui/ux"],
    "Forward Deployed": ["forward deploy*", "solutions engineer*", "customer engineer*"],
}
_RX = {k: re.compile("|".join(
    (r"(?<![a-z0-9])" + re.escape(w[:-1])) if w.endswith("*") else (r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])")
    for w in v), re.I) for k, v in ROLE_KEYWORDS.items()}
# Interest areas that are their own track: a title in one of these is off-target unless the user chose it
DISTINCT = {"Hardware / Embedded", "Design / UX", "Product", "Quant", "Mobile", "Frontend", "Security"}
# Choosing any of these makes generic "Software Engineer Intern" titles relevant too
SWE_ADJACENT = {"Backend", "Full Stack", "Frontend", "Mobile", "DevOps / Cloud", "Data Engineering", "Forward Deployed", "AI / ML"}
SENIOR = re.compile(r"\b(senior|staff|principal|lead|manager|director|phd|ph\.d|mba)\b", re.I)


def _ym(s):
    if not s:
        return None
    m = re.match(r"(\d{4})-(\d{1,2})", str(s))
    return int(m.group(1)) * 12 + int(m.group(2)) if m else None


def _window(profile, kind):
    a, b = _ym(profile.get(f"{kind}_from")), _ym(profile.get(f"{kind}_to"))
    return (a or b, b or a) if (a or b) else None


def _gap_months(spans, win):
    """Months between the closest listed term and the user's free window (0 = overlap)."""
    return min(max(0, win[0] - b, a - win[1]) for a, b in spans)


def prepare(profile):
    """Pre-compiles what scoring needs once per request."""
    p = dict(profile or {})
    p["_roles"] = [r for r in p.get("roles") or [] if r in _RX]
    p["_avoid"] = [r for r in p.get("avoid_roles") or [] if r in _RX]
    p["_skills"] = [(s, word_re(s)) for s in (p.get("skills") or [])[:40] if s and len(s) > 1]
    locs = [l for l in p.get("locations") or [] if l]
    p["_locm"] = location_matchers([l for l in locs if not re.search(r"anywhere", l, re.I)])
    p["_anywhere"] = {c for l in locs for c in ("us", "india") if re.search(rf"anywhere.*\b{c}\b", l, re.I)}
    modes = {m.lower() for m in p.get("work_modes") or []}
    p["_remote_ok"] = not modes or "remote" in modes
    p["_onsite_ok"] = not modes or bool(modes & {"onsite", "hybrid"})
    p["_win_remote"] = _window(p, "remote")
    p["_win_onsite"] = _window(p, "onsite")
    return p


def score(job, p, now=None):
    """Returns (score, reasons[])."""
    now = now or time.time()
    title = job.get("title") or ""
    reasons = []
    s = 20

    # role interest
    hit_roles = [r for r in p["_roles"] if _RX[r].search(title)]
    off_track = [r for r in DISTINCT - set(p["_roles"]) if _RX[r].search(title)]
    if hit_roles:
        s += 25
        reasons.append(hit_roles[0])
    elif set(p["_roles"]) & SWE_ADJACENT and _RX["Software Engineering"].search(title):
        s += 18
        reasons.append("Software Engineering")
    elif p["_roles"]:
        s -= 8
    if off_track:
        s -= 12 if hit_roles else 18
    if any(_RX[r].search(title) for r in p["_avoid"]) and not hit_roles:
        s -= 25
    if SENIOR.search(title):
        s -= 20

    # skills mentioned in the title
    sk = [name for name, rx in p["_skills"] if rx.search(title)]
    if sk:
        s += min(12, 4 * len(sk))
        reasons.append(", ".join(sk[:2]))

    # location
    locs = job.get("locations") or []
    is_remote = bool(job.get("remote")) or any(REMOTE_RE.search(l) for l in locs)
    loc_hit = any(pred(l, job) for _, pred in p["_locm"] for l in locs)
    if loc_hit and p["_onsite_ok"]:
        s += 22
    elif is_remote and p["_remote_ok"]:
        s += 18
    elif p["_anywhere"] and any(loc_country(l) in p["_anywhere"] for l in locs):
        s += 10
    elif p["_locm"] or p["_anywhere"]:
        s -= 10

    # dates vs availability
    spans = [x for x in (term_months(t) for t in job.get("terms") or []) if x]
    win = p["_win_remote"] if is_remote else p["_win_onsite"]
    # Missing dates cost nothing, and being a few months off is a small nudge, not a verdict.
    if not spans:
        s += 12                                   # same as a match: unstated dates aren't a mark against it
    elif win:
        gap = _gap_months(spans, win)
        s += 12 if gap == 0 else 8 if gap <= 3 else 2 if gap <= 6 else -4

    # degree and work authorisation
    deg = set(job.get("degrees") or [])
    level = p.get("degree_level") or "bachelors"
    if deg and level in ("bachelors", "high_school", "other") and not deg & {"Bachelor's", "Associate's"}:
        s -= 35
    spons = job.get("sponsorship") or ""
    auth = p.get("us_work_auth") or "not_applicable"
    if loc_country((locs or [""])[0]) == "us":
        if auth == "needs_sponsorship" and "Does Not Offer" in spons:
            s -= 40
        if "Citizenship" in spons and auth != "citizen":
            s -= 40
    if p.get("paid_only") and job.get("stipend") and re.search(r"unpaid", job["stipend"], re.I):
        s -= 40

    # freshness
    posted = job.get("posted")
    if posted:
        age = (now - posted) / 86400
        s += 6 if age <= 3 else 3 if age <= 14 else 0

    return max(0, min(100, s)), reasons


def profile_summary(p):
    """One paragraph about the user for the LLM's system prompt."""
    if not p:
        return None
    bits = []
    if p.get("full_name"):
        bits.append(p["full_name"])
    edu = " ".join(x for x in [p.get("year_of_study"), p.get("degree"), p.get("major")] if x)
    if edu or p.get("college"):
        bits.append(f"{edu} at {p.get('college') or 'their college'}".strip())
    if p.get("grad_year"):
        bits.append(f"graduating {p['grad_year']}")
    if p.get("based_in"):
        bits.append(f"based in {p['based_in']}")
    out = ", ".join(bits) + "."
    if p.get("skills"):
        out += f" Skills: {', '.join(p['skills'][:20])}."
    if p.get("roles"):
        out += f" Interested in: {', '.join(p['roles'])}."
    if p.get("avoid_roles"):
        out += f" Not interested in: {', '.join(p['avoid_roles'])}."
    if p.get("locations"):
        out += f" Preferred locations: {', '.join(p['locations'])}."
    if p.get("work_modes"):
        out += f" Open to: {', '.join(p['work_modes'])}."
    if p.get("remote_from") or p.get("onsite_from"):
        out += (f" Available remotely {p.get('remote_from') or '?'} to {p.get('remote_to') or '?'};"
                f" in person {p.get('onsite_from') or '?'} to {p.get('onsite_to') or '?'}.")
    auth = {"citizen": "US citizen", "authorized": "authorised to work in the US (no sponsorship needed)",
            "needs_sponsorship": "needs US visa sponsorship", "not_applicable": None}.get(p.get("us_work_auth"))
    if auth:
        out += f" Work authorisation: {auth}."
    if p.get("paid_only"):
        out += " Only wants paid internships."
    exp = [e for e in p.get("experience") or [] if isinstance(e, dict)][:3]
    if exp:
        out += " Experience: " + "; ".join(f"{e.get('title')} at {e.get('company')}" for e in exp) + "."
    if p.get("projects_summary"):
        out += f" Projects: {p['projects_summary']}."
    return out


def _fmt_ym(v):
    return f"{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(v - 1) % 12]} {(v - 1) // 12}"


def explain(job, p):
    """Plain-language checks behind the score: [{"ok": True|False|None, "text": str}]."""
    title = job.get("title") or ""
    out = []
    hit_roles = [r for r in p["_roles"] if _RX[r].search(title)]
    if hit_roles:
        out.append({"ok": True, "text": f"Matches your interest in {hit_roles[0]}"})
    elif set(p["_roles"]) & SWE_ADJACENT and _RX["Software Engineering"].search(title):
        out.append({"ok": True, "text": "A general software role, which fits the areas you picked"})
    elif p["_roles"]:
        out.append({"ok": False, "text": "Outside the kinds of roles you picked"})
    if any(_RX[r].search(title) for r in p["_avoid"]) and not hit_roles:
        out.append({"ok": False, "text": "In an area you asked to skip"})
    if SENIOR.search(title):
        out.append({"ok": False, "text": "The title suggests a senior or graduate-level role"})
    sk = [name for name, rx in p["_skills"] if rx.search(title)]
    if sk:
        out.append({"ok": True, "text": f"Mentions your skills: {', '.join(sk[:3])}"})

    locs = job.get("locations") or []
    is_remote = bool(job.get("remote")) or any(REMOTE_RE.search(l) for l in locs)
    loc_hit = [l for l in locs if any(pred(l, job) for _, pred in p["_locm"])]
    if loc_hit and p["_onsite_ok"]:
        out.append({"ok": True, "text": f"In one of your locations ({loc_hit[0]})"})
    elif is_remote and p["_remote_ok"]:
        out.append({"ok": True, "text": "Remote, and you’re open to remote work"})
    elif p["_anywhere"] and any(loc_country(l) in p["_anywhere"] for l in locs):
        out.append({"ok": True, "text": "In a country you said anywhere in is fine"})
    elif p["_locm"] or p["_anywhere"]:
        out.append({"ok": False, "text": "Not in any of your locations"})

    spans = [x for x in (term_months(t) for t in job.get("terms") or []) if x]
    win = p["_win_remote"] if is_remote else p["_win_onsite"]
    if not spans:
        out.append({"ok": None, "text": "Dates aren’t stated. This doesn’t lower the match; check them before applying"})
    elif win:
        gap = _gap_months(spans, win)
        if gap == 0:
            out.append({"ok": True, "text": f"Overlaps when you’re free ({_fmt_ym(win[0])} to {_fmt_ym(win[1])})"})
        elif gap <= 3:
            out.append({"ok": None, "text": f"Dates are within {gap} month{'s' if gap > 1 else ''} of when you’re free; a small difference"})
        else:
            out.append({"ok": False, "text": f"Runs outside when you’re free ({_fmt_ym(win[0])} to {_fmt_ym(win[1])})"})

    deg = set(job.get("degrees") or [])
    level = p.get("degree_level") or "bachelors"
    if deg and level in ("bachelors", "high_school", "other") and not deg & {"Bachelor's", "Associate's"}:
        out.append({"ok": False, "text": f"Asks for a {' or '.join(sorted(deg))} degree"})
    elif deg & {"Bachelor's", "Associate's"}:
        out.append({"ok": True, "text": "Open to bachelor’s students"})

    spons = job.get("sponsorship") or ""
    auth = p.get("us_work_auth") or "not_applicable"
    if loc_country((locs or [""])[0]) == "us":
        if "Citizenship" in spons and auth != "citizen":
            out.append({"ok": False, "text": "Open to US citizens only"})
        elif "Does Not Offer" in spons:
            out.append({"ok": auth != "needs_sponsorship",
                        "text": "No visa sponsorship" + (", and you said you’d need it" if auth == "needs_sponsorship" else ", which is fine for you")})
    if p.get("paid_only") and job.get("stipend") and re.search(r"unpaid", job["stipend"], re.I):
        out.append({"ok": False, "text": "Unpaid, and you asked for paid roles only"})
    return out
