"""Plain keyword search over every listing: "ml intern bangalore", "sde", "stripe", "react remote".

Unlike Explore, this ignores the profile's saved filters (roles, cities) so you see everything
that matches what you typed. Fit is still scored so the best matches for you come first.

Each word or known phrase becomes a group of synonyms ("sde" -> software engineer / developer / swe);
every group has to match the title, company or category. Words that match no title but do match
places ("bangalore", "remote", "us") become a location filter instead.
"""
from __future__ import annotations

import re
import time

from search import ALIASES, OTHER_COUNTRIES, STATE_NAME_TO_CODE, compact, location_matchers, norm, word_re

STOP = {"intern", "interns", "internship", "internships", "role", "roles", "job", "jobs", "position", "positions",
        "opening", "openings", "for", "in", "at", "the", "a", "an", "and", "or", "of", "with", "summer", "winter",
        "fall", "spring", "co-op", "coop", "trainee", "2026", "2027", "2028", "near", "me", "any", "all"}

# phrase or short form -> what it should match. Longest phrases are taken first.
SYN = {
    "software engineer": ["software engineer", "software engineering", "software developer", "software development", "swe", "sde"],
    "software engineering": ["software engineer", "software engineering", "software developer", "software development", "swe", "sde"],
    "software developer": ["software developer", "software development", "software engineer", "sde", "swe"],
    "swe": ["software engineer", "software engineering", "software developer", "software development", "swe", "sde"],
    "sde": ["software engineer", "software engineering", "software developer", "software development", "swe", "sde"],
    "developer": ["developer", "development", "engineer"],
    "machine learning": ["machine learning", "ml", "deep learning", "ai/ml"],
    "ml": ["machine learning", "ml", "deep learning", "mlops", "ai/ml", "artificial intelligence", "ai"],
    "ai": ["ai", "artificial intelligence", "machine learning", "genai", "generative ai", "llm", "ai/ml"],
    "artificial intelligence": ["ai", "artificial intelligence", "genai"],
    "genai": ["genai", "generative ai", "llm", "gen ai"],
    "llm": ["llm", "large language", "genai", "generative ai", "nlp"],
    "nlp": ["nlp", "natural language", "llm"],
    "computer vision": ["computer vision", "cv", "perception", "image"],
    "data science": ["data science", "data scientist", "ds"],
    "data scientist": ["data science", "data scientist"],
    "ds": ["data science", "data scientist"],
    "data analyst": ["data analyst", "data analytics", "business analyst", "analytics"],
    "analyst": ["analyst", "analytics"],
    "data engineer": ["data engineer", "data engineering", "etl", "data platform"],
    "frontend": ["frontend", "front end", "front-end", "ui engineer", "react", "web developer"],
    "front end": ["frontend", "front end", "front-end"],
    "backend": ["backend", "back end", "back-end", "server", "api"],
    "back end": ["backend", "back end", "back-end"],
    "full stack": ["full stack", "fullstack", "full-stack"],
    "fullstack": ["full stack", "fullstack", "full-stack"],
    "web": ["web", "frontend", "full stack", "website"],
    "mobile": ["mobile", "ios", "android", "flutter", "react native", "app developer"],
    "app": ["app", "mobile", "ios", "android"],
    "devops": ["devops", "sre", "site reliability", "platform", "infrastructure", "cloud"],
    "sre": ["sre", "site reliability", "devops"],
    "cloud": ["cloud", "aws", "azure", "gcp", "devops", "infrastructure"],
    "security": ["security", "cybersecurity", "cyber security", "infosec", "appsec"],
    "cyber": ["cyber", "cybersecurity", "security"],
    "embedded": ["embedded", "firmware", "hardware", "fpga"],
    "hardware": ["hardware", "embedded", "asic", "fpga", "silicon", "chip", "vlsi"],
    "vlsi": ["vlsi", "asic", "silicon", "chip", "rtl"],
    "quant": ["quant", "quantitative", "trading", "trader"],
    "trading": ["trading", "trader", "quant"],
    "pm": ["product manager", "product management", "pm", "apm"],
    "product": ["product manager", "product management", "product"],
    "product manager": ["product manager", "product management", "apm"],
    "design": ["design", "designer", "ux", "ui/ux"],
    "ux": ["ux", "user experience", "ui/ux", "product design", "designer"],
    "ui": ["ui", "ui/ux", "frontend", "designer"],
    "research": ["research", "researcher", "r&d"],
    "robotics": ["robotics", "robot", "autonomy", "autonomous"],
    "game": ["game", "gaming", "unity", "unreal"],
    "blockchain": ["blockchain", "web3", "crypto", "smart contract"],
    "marketing": ["marketing", "growth", "seo", "content"],
    "finance": ["finance", "financial", "investment", "banking"],
    "consulting": ["consulting", "consultant", "strategy"],
    "forward deployed": ["forward deployed", "fde", "solutions engineer", "customer engineer"],
    "fde": ["forward deployed", "fde"],
    "qa": ["qa", "quality", "test", "testing", "sdet"],
    "testing": ["test", "testing", "qa", "sdet"],
    "react": ["react", "react.js", "reactjs"],
    "node": ["node", "node.js", "nodejs"],
    "golang": ["golang", "go"],
}
PHRASES = sorted((k for k in SYN if " " in k), key=len, reverse=True)
PLACE_PHRASES = sorted({k for k in list(ALIASES) + list(STATE_NAME_TO_CODE) + list(OTHER_COUNTRIES) if " " in k},
                       key=len, reverse=True)
TOKEN = re.compile(r"[a-z0-9][a-z0-9+#./&-]*")


def parse(q: str):
    """Query -> list of groups (each a list of alternatives), plus a 'remote' flag."""
    s = " " + norm(q).replace(",", " ") + " "
    groups, remote, places = [], False, []
    for p in PLACE_PHRASES:                  # "new york", "bay area", "united kingdom"
        if f" {p} " in s:
            places.append(p)
            s = s.replace(f" {p} ", " ")
    for p in PHRASES:
        if f" {p} " in s:
            groups.append((p, SYN[p]))
            s = s.replace(f" {p} ", " ")
    for t in TOKEN.findall(s):
        t = t.strip("./&-")
        if not t or t in STOP:
            continue
        if t in ("remote", "wfh"):
            remote = True
            continue
        groups.append((t, SYN.get(t, [t])))
    return groups, remote, places


def _field_text(j):
    return f"{j.get('title', '')} {j.get('company', '')}"


def _count(jobs, pred, cap=400):
    n = 0
    for j in jobs:
        if pred(j):
            n += 1
            if n >= cap:
                break
    return n


def find(jobs, q, *, profile=None, remote=None, region=None, hide_stale=True, sort="relevance",
         offset=0, limit=30, now=None):
    now = now or time.time()
    groups, said_remote, places = parse(q)
    if said_remote and remote is None:
        remote = True

    compiled = [(word, [word_re(a) for a in alts]) for word, alts in groups]
    role_groups = []
    for word, rxs in compiled:
        as_role = _count(jobs, lambda j: any(r.search(_field_text(j)) for r in rxs))
        (_, pred), = location_matchers([word]) or [(None, None)]
        as_place = _count(jobs, lambda j: any(pred(l, j) for l in j.get("locations") or [])) if pred else 0
        if as_role and as_role >= as_place:
            role_groups.append((word, rxs))
        else:
            places.append(word)              # "bangalore", "us", "london": a place, not a title
    locm = location_matchers(places)
    unknown = []
    if places:
        # a word that's neither a role nor a place matches nothing: say so instead of returning junk
        for (label, pred) in locm:
            if not any(pred(l, j) for j in jobs for l in (j.get("locations") or [])):
                unknown.append(label)
    regionm = location_matchers([region]) if region else []

    prof = None
    if profile:
        from fit import prepare, score as fit_score
        prof = prepare(profile)
    if hide_stale:
        from market import freshness

    hits = []
    if not role_groups and not places and remote is None:
        unknown = [q]                        # only filler words ("in", "jobs")
    if unknown:
        return {"query": q, "understood": [w for w, _ in role_groups], "places": places,
                "unknown": unknown, "total": 0, "results": []}
    for j in jobs:
        title, company = j.get("title", ""), j.get("company", "")
        score, ok = 0.0, True
        for word, rxs in role_groups:
            if any(r.search(title) for r in rxs):
                score += 4 if rxs[0].search(title) else 3
            elif any(r.search(company) for r in rxs):
                score += 5                   # they typed a company name
            else:
                ok = False
                break
        if not ok:
            continue
        if role_groups and len(role_groups) > 1 and norm(" ".join(w for w, _ in role_groups)) in norm(title):
            score += 3                       # the exact phrase they typed
        locs = j.get("locations") or []
        if locm and not all(any(pred(l, j) for l in locs) for _, pred in locm):
            continue
        if regionm and not any(pred(l, j) for _, pred in regionm for l in locs):
            continue
        is_remote = bool(j.get("remote")) or any("remote" in l.lower() for l in locs)
        if remote is True and not is_remote:
            continue
        if remote is False and is_remote and not any("remote" not in l.lower() for l in locs):
            continue
        if j.get("closes") and j["closes"] < now:
            continue
        if hide_stale and freshness(j, now)["level"] == "ghost":
            continue
        fit = (fit_score(j, prof, now)[0] if prof else None) or 0
        posted = j.get("posted") or 0
        if posted:
            age = (now - posted) / 86400
            score += 1.5 if age < 3 else 0.75 if age < 14 else 0
        score += fit / 50
        hits.append((score, posted, fit, j))

    key = {"newest": lambda h: (-h[1], -h[0]), "fit": lambda h: (-h[2], -h[0])}.get(sort, lambda h: (-h[0], -h[1]))
    hits.sort(key=key)
    seen, uniq = set(), []
    for h in hits:                           # the same role reposted on two boards shows once
        k = (norm(h[3].get("company")), norm(h[3].get("title")), norm((h[3].get("locations") or [""])[0]))
        if k not in seen:
            seen.add(k)
            uniq.append(h)
    hits = uniq
    limit = max(1, min(int(limit or 30), 50))
    companies = {}
    for _, _, _, j in hits:
        companies[j.get("company")] = companies.get(j.get("company"), 0) + 1
    return {
        "query": q, "understood": [w for w, _ in role_groups], "places": places, "unknown": [],
        "total": len(hits),
        "remote_count": sum(1 for h in hits if h[3].get("remote") or any("remote" in l.lower() for l in h[3].get("locations") or [])),
        "top_companies": sorted(companies.items(), key=lambda x: -x[1])[:6],
        "results": [compact(j, fit=fit if prof else None) for _, _, fit, j in hits[int(offset or 0): int(offset or 0) + limit]],
    }


def suggest(jobs, q, limit=8):
    """Type-ahead: role titles and companies that start with (or contain) what's typed."""
    qn = norm(q)
    if len(qn) < 2:
        return []
    titles, comps = {}, {}
    for j in jobs:
        t = re.sub(r"\s*[-–(|,].*$", "", j.get("title", "")).strip()        # "SWE Intern - Payments" -> "SWE Intern"
        tn = norm(t)
        if qn in tn and len(t) < 60:
            titles[t] = titles.get(t, 0) + (3 if tn.startswith(qn) else 1)
        c = j.get("company") or ""
        if qn in norm(c):
            comps[c] = comps.get(c, 0) + (3 if norm(c).startswith(qn) else 1)
    cos = [{"kind": "company", "text": c, "count": 0} for c, n in sorted(comps.items(), key=lambda x: -x[1])[:3]]
    roles = [{"kind": "role", "text": t, "count": n} for t, n in sorted(titles.items(), key=lambda x: -x[1])[: limit - len(cos)]]
    # a company that starts with what's typed ("goo" -> Google) goes first; otherwise roles lead
    lead = [c for c in cos if norm(c["text"]).startswith(qn) and comps[c["text"]] >= 15]
    return lead[:1] + roles + [c for c in cos if c not in lead[:1]]
