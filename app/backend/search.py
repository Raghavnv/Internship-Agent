"""Search engine over the internship listings.

Pure Python, no database: ~5k listings fit comfortably in memory and filter in milliseconds.
Both the REST endpoint and the LLM tool call `search()` / `aggregate()`.
"""
from __future__ import annotations

import re
import time
from collections import Counter
from datetime import date

# ── location knowledge ──────────────────────────────────────────────
US_STATES = {
    "AL": "alabama", "AK": "alaska", "AZ": "arizona", "AR": "arkansas", "CA": "california", "CO": "colorado",
    "CT": "connecticut", "DE": "delaware", "FL": "florida", "GA": "georgia", "HI": "hawaii", "ID": "idaho",
    "IL": "illinois", "IN": "indiana", "IA": "iowa", "KS": "kansas", "KY": "kentucky", "LA": "louisiana",
    "ME": "maine", "MD": "maryland", "MA": "massachusetts", "MI": "michigan", "MN": "minnesota",
    "MS": "mississippi", "MO": "missouri", "MT": "montana", "NE": "nebraska", "NV": "nevada",
    "NH": "new hampshire", "NJ": "new jersey", "NM": "new mexico", "NY": "new york", "NC": "north carolina",
    "ND": "north dakota", "OH": "ohio", "OK": "oklahoma", "OR": "oregon", "PA": "pennsylvania",
    "RI": "rhode island", "SC": "south carolina", "SD": "south dakota", "TN": "tennessee", "TX": "texas",
    "UT": "utah", "VT": "vermont", "VA": "virginia", "WA": "washington", "WV": "west virginia",
    "WI": "wisconsin", "WY": "wyoming", "DC": "district of columbia",
}
STATE_NAME_TO_CODE = {v: k for k, v in US_STATES.items()}

# A query term on the left matches a listing location containing any of the terms on the right.
ALIASES = {
    "bay area": ["san francisco", "sf", "san jose", "santa clara", "sunnyvale", "mountain view", "palo alto",
                 "menlo park", "cupertino", "redwood city", "san mateo", "foster city", "fremont", "milpitas",
                 "oakland", "berkeley", "emeryville", "south san francisco", "burlingame", "san bruno",
                 "los gatos", "campbell", "pleasanton", "newark, ca", "hayward", "bay area"],
    "silicon valley": ["san jose", "santa clara", "sunnyvale", "mountain view", "palo alto", "menlo park",
                       "cupertino", "milpitas", "los gatos", "campbell"],
    "san francisco": ["san francisco", "sf", "south san francisco"],
    "sf": ["san francisco", "sf"],
    "dallas": ["dallas", "irving", "plano", "frisco", "richardson", "addison", "fort worth", "arlington, tx",
               "carrollton", "allen, tx", "mckinney", "dfw"],
    "dfw": ["dallas", "irving", "plano", "frisco", "richardson", "fort worth", "dfw"],
    "houston": ["houston", "sugar land", "the woodlands", "katy", "spring, tx", "pasadena, tx"],
    "austin": ["austin", "round rock", "cedar park", "georgetown, tx", "pflugerville"],
    "seattle": ["seattle", "redmond", "bellevue", "kirkland", "bothell"],
    "new york": ["new york", "nyc", "brooklyn", "manhattan", "jersey city"],
    "nyc": ["new york", "nyc", "brooklyn", "manhattan"],
    "la": ["los angeles", "santa monica", "culver city", "irvine", "pasadena, ca", "el segundo"],
    "los angeles": ["los angeles", "santa monica", "culver city", "el segundo", "burbank"],
    "boston": ["boston", "cambridge, ma", "waltham", "somerville"],
    "dc": ["washington, dc", "dc", "arlington, va", "mclean", "reston", "bethesda"],
    "bangalore": ["bangalore", "bengaluru"],
    "bengaluru": ["bangalore", "bengaluru"],
    "gurgaon": ["gurgaon", "gurugram"],
    "gurugram": ["gurgaon", "gurugram"],
    "delhi": ["delhi", "new delhi", "noida", "gurgaon", "gurugram", "ncr"],
    "mumbai": ["mumbai", "bombay", "navi mumbai", "thane"],
}
INDIA_CITIES = ["india", "bangalore", "bengaluru", "hyderabad", "pune", "mumbai", "delhi", "gurgaon", "gurugram",
                "noida", "chennai", "kolkata", "ahmedabad", "jaipur", "kochi", "chandigarh", "mysore", "mysuru"]
OTHER_COUNTRIES = {
    "canada": ["canada", "toronto", "vancouver", "montreal", "waterloo", "ottawa", "calgary", ", on", ", bc",
               ", ab", ", qc"],
    "uk": ["uk", "united kingdom", "london", "england", "edinburgh", "manchester", "cambridge, uk"],
    "germany": ["germany", "berlin", "munich"], "singapore": ["singapore"], "ireland": ["ireland", "dublin"],
}
REMOTE_RE = re.compile(r"\b(remote|work from home|wfh|anywhere)\b", re.I)
US_RE = re.compile(r",\s*(" + "|".join(US_STATES) + r")\b|\b(usa|united states|us|nyc|sf)\b", re.I)

# ── seasons → months (for date-range questions) ──
SEASON_MONTHS = {"winter": (1, 4), "spring": (1, 5), "summer": (5, 8), "fall": (9, 12)}
TERM_RE = re.compile(r"(winter|spring|summer|fall)\s+(\d{4})", re.I)


def norm(s):
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def word_re(term):
    t = norm(term)
    return re.compile(r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])", re.I)


INDIA_RX = re.compile(r"(?<![a-z])(" + "|".join(INDIA_CITIES) + r")(?![a-z])", re.I)
OTHER_RX = {c: re.compile(r"(?<![a-z])(" + "|".join(re.escape(k.strip(", ")) if not k.startswith(",") else re.escape(k)
                                                     for k in keys) + r")(?![a-z])", re.I)
            for c, keys in OTHER_COUNTRIES.items()}


def loc_country(loc):
    l = norm(loc)
    if INDIA_RX.search(l):
        return "india"
    for c, rx in OTHER_RX.items():
        if rx.search(l):
            return c
    if US_RE.search(loc) or any(f" {name}" in f" {l}" for name in STATE_NAME_TO_CODE):
        return "us"
    return None


def location_matchers(query_locs):
    """Turn user location words into a list of (label, predicate) pairs."""
    out = []
    for q in query_locs or []:
        qn = norm(q)
        if not qn:
            continue
        if qn in ("remote", "wfh", "work from home", "anywhere"):
            out.append((q, lambda loc, j: bool(REMOTE_RE.search(loc)) or j.get("remote")))
            continue
        if qn in ("us", "usa", "united states", "america", "u.s."):
            out.append((q, lambda loc, j: loc_country(loc) == "us"))
            continue
        if qn in ("india",):
            out.append((q, lambda loc, j: loc_country(loc) == "india"))
            continue
        if qn in OTHER_COUNTRIES:
            out.append((q, lambda loc, j, c=qn: loc_country(loc) == c))
            continue
        code = STATE_NAME_TO_CODE.get(qn) or (qn.upper() if qn.upper() in US_STATES and len(qn) == 2 else None)
        if code and qn not in ("la", "dc", "in", "or", "me"):
            rx = re.compile(r",\s*" + code + r"\b", re.I)
            out.append((q, lambda loc, j, rx=rx, name=US_STATES[code]: bool(rx.search(loc)) or name in norm(loc)))
            continue
        keys = ALIASES.get(qn, [qn])
        rxs = [word_re(k) for k in keys]
        out.append((q, lambda loc, j, rxs=rxs: any(r.search(loc) for r in rxs)))
    return out


def term_months(term):
    m = TERM_RE.search(term or "")
    if not m:
        return None
    a, b = SEASON_MONTHS[m.group(1).lower()]
    y = int(m.group(2))
    return (y * 12 + a, y * 12 + b)


def ym(s):
    """'2027-06' / '2027-06-15' -> month index."""
    if not s:
        return None
    m = re.match(r"(\d{4})-(\d{1,2})", str(s))
    return int(m.group(1)) * 12 + int(m.group(2)) if m else None


# ── main search ─────────────────────────────────────────────────────
SORTS = ("relevance", "newest", "fit", "closing", "found", "alerted")


def search(jobs, *, sort="relevance", limit=20, offset=0, now=None, dedupe=True, **filters):
    hits = match(jobs, now=now, **filters)
    fits = {id(h[3]): h[2] for h in hits}
    now = now or time.time()

    def urgency(j):
        """A bump for roles that close within a week, so they don't sink below ones that can wait."""
        c = j.get("closes")
        if not c:
            return 0
        days = (c - now) / 86400
        return 8 if days <= 3 else 4 if days <= 7 else 0

    key = {"newest": lambda h: (-h[1], -h[0]),
           "found": lambda h: (-(h[3].get("first_seen") or 0), -h[2], -h[0]),
           "alerted": lambda h: (-(h[3].get("alerted") or 0), -h[2], -h[0]),
           "fit": lambda h: (-(h[2] + urgency(h[3]) if h[2] else 0), -h[0], -h[1]),
           "closing": lambda h: (h[3].get("closes") or 9e12, -h[2], -h[0])}.get(
        sort, lambda h: (-(h[0] + urgency(h[3]) / 4), -h[1]))
    hits.sort(key=key)
    # same role reposted (same company + title + first city) -> keep the best-ranked copy
    # roles that are new (last 3 days), sent to WhatsApp, or all of one company's are never merged away
    if dedupe and not filters.get("company_is"):
        recent = now - 3 * 86400
        seen, uniq = set(), []
        for h in hits:
            j = h[3]
            if j.get("alerted") or (j.get("first_seen") or 0) >= recent:
                uniq.append(h)
                continue
            k = (norm(j.get("company")), norm(j.get("title")), norm((j.get("locations") or [""])[0]))
            if k not in seen:
                seen.add(k)
                uniq.append(h)
        hits = uniq
    limit = max(1, min(int(limit or 20), 100))
    page = hits[int(offset or 0): int(offset or 0) + limit]
    return {"total": len(hits), "results": [compact(j, ml, fit=fits.get(id(j))) for *_, j, ml in page]}


def match(jobs, *, keywords=None, any_keywords=None, exclude_keywords=None, companies=None,
           exclude_companies=None, locations=None, remote=None, start_month=None, end_month=None, terms=None,
           include_undated=True, posted_within_days=None, categories=None, needs_sponsorship=False,
           exclude_citizenship_required=False, undergrad_only=False, fit_only=False, now=None, profile=None,
           min_fit=55, hide_stale=False, closing_within_days=None, new_within_hours=None, alerted_only=False,
           exclude_ids=None, company_is=None):
    """Returns [(relevance, posted, fit, job, matched_locations)] for listings passing every filter."""
    now = now or time.time()
    kw_all = [word_re(k) for k in (keywords or []) if norm(k)]
    kw_any = [word_re(k) for k in (any_keywords or []) if norm(k)]
    kw_ex = [word_re(k) for k in (exclude_keywords or []) if norm(k)]
    comp = [norm(c) for c in companies or [] if norm(c)]
    comp_ex = [norm(c) for c in exclude_companies or [] if norm(c)]
    locm = location_matchers(locations)
    cats = {norm(c) for c in categories or []}
    want_terms = {norm(t) for t in terms or []}
    rng = (ym(start_month), ym(end_month)) if (start_month or end_month) else None
    if rng:
        rng = (rng[0] or rng[1], rng[1] or rng[0])

    prof = None
    if profile:
        from fit import prepare, score as fit_score
        prof = prepare(profile)
    hits = []
    if hide_stale:
        from market import freshness
    skip = set(exclude_ids or [])
    from market import company_key
    only_cos = {company_key(c) for c in company_is or [] if c}     # one exact company, e.g. from "Just opened"
    fresh_after = now - float(new_within_hours) * 3600 if new_within_hours else None
    for j in jobs:
        if skip and j.get("id") in skip:
            continue                      # already applied: it lives on the Applications board
        if alerted_only and not j.get("alerted"):
            continue
        if fresh_after and (j.get("first_seen") or 0) < fresh_after:
            continue
        title = j.get("title", "")
        company = j.get("company", "")
        text = f"{title} {company}"
        if kw_all and not all(r.search(text) for r in kw_all):
            continue
        if only_cos and company_key(company) not in only_cos:
            continue
        # WhatsApp-sent roles, and a company you opened on purpose, are never hidden as "stale"
        if hide_stale and not only_cos and not j.get("alerted") and freshness(j, now)["level"] == "ghost":
            continue
        closes = j.get("closes") or 0
        if closes and closes < now:
            continue                      # deadline passed: the role can't be applied to any more
        if closing_within_days is not None and not (closes and closes - now <= closing_within_days * 86400):
            continue
        if kw_any and not any(r.search(text) for r in kw_any):
            continue
        if kw_ex and any(r.search(title) for r in kw_ex):
            continue
        cn = norm(company)
        if comp and not any(c in cn for c in comp):
            continue
        if comp_ex and any(c in cn for c in comp_ex):
            continue
        if cats and norm(j.get("category")) not in cats:
            # categories only exist on the Simplify feed; keep uncategorised listings for software-ish asks
            if j.get("category") or not cats & {"software", "ai/ml/data"}:
                continue
        locs = j.get("locations") or []
        is_remote = bool(j.get("remote")) or any(REMOTE_RE.search(l) for l in locs)
        if remote == "only" and not is_remote:
            continue
        if remote == "exclude" and is_remote and all(REMOTE_RE.search(l) for l in locs):
            continue
        matched_locs = []
        if locm:
            for label, pred in locm:
                matched_locs += [l for l in locs if pred(l, j)]
            if not matched_locs:
                continue
        jt = j.get("terms") or []
        if want_terms and not ({norm(t) for t in jt} & want_terms):
            if jt or not include_undated:
                continue
        if rng:
            spans = [s for s in (term_months(t) for t in jt) if s]
            if spans:
                if not any(a <= rng[1] and b >= rng[0] for a, b in spans):
                    continue
            elif not include_undated:
                continue
        posted = j.get("posted") or j.get("first_seen")
        if posted_within_days and posted and now - posted > posted_within_days * 86400:
            continue
        spons = j.get("sponsorship") or ""
        if needs_sponsorship and ("Does Not Offer" in spons or "Citizenship" in spons):
            continue
        if exclude_citizenship_required and "Citizenship" in spons:
            continue
        deg = j.get("degrees") or []
        if undergrad_only and deg and not ({"Bachelor's", "Associate's"} & set(deg)):
            continue
        fit = fit_score(j, prof, now)[0] if prof else (j.get("fit") or {}).get("score")
        if fit_only and (fit is None or fit < (min_fit if prof else 0)):
            continue

        # relevance: keyword hits in title, location precision, recency, personal fit
        score = 0.0
        for r in kw_all + kw_any:
            score += 3 if r.search(title) else 1
        if matched_locs:
            score += 2
        if posted:
            age = (now - posted) / 86400
            score += 2 if age < 3 else 1 if age < 14 else 0
        if fit:
            score += fit / 50
        hits.append((score, posted or 0, fit or 0, j, matched_locs))
    return hits


def compact(j, matched_locs=None, fit=None):
    locs = j.get("locations") or []
    shown = (matched_locs or [])[:3] or locs[:3]
    geo = j.get("geo") or []
    pins = []
    for l in shown:
        try:
            g = geo[locs.index(l)]
        except (ValueError, IndexError):
            g = None
        if g:
            pins.append(g[:2])
    posted = j.get("posted")
    from market import freshness
    from deadlines import days_left
    fr = freshness(j)
    return {
        "closes": j.get("closes"), "closes_in": days_left(j.get("closes")),
        "fresh": fr["level"], "reposts": j.get("reposts") or 0, "first_seen": j.get("first_seen"), "alerted": j.get("alerted"), "gone": bool(j.get("gone")),
        "id": j["id"], "title": j.get("title"), "company": j.get("company"), "url": j.get("url"),
        "locations": shown, "more_locations": max(0, len(locs) - len(shown)), "terms": j.get("terms") or [],
        "remote": bool(j.get("remote")), "posted": date.fromtimestamp(posted).isoformat() if posted else None,
        "category": j.get("category"), "sponsorship": j.get("sponsorship"), "stipend": j.get("stipend"),
        "fit": fit if fit is not None else (j.get("fit") or {}).get("score"), "source": j.get("source"), "pins": pins,
    }


def city_map(jobs, top=600):
    """Listing counts per geocoded city, for the map's base layer."""
    agg = {}
    for j in jobs:
        for g in {tuple(g) for g in (j.get("geo") or []) if g}:
            k = (round(g[0], 2), round(g[1], 2))
            a = agg.setdefault(k, [g[0], g[1], g[2], 0])
            a[3] += 1
    rows = sorted(agg.values(), key=lambda r: -r[3])[:top]
    return [{"lat": r[0], "lng": r[1], "city": r[2], "count": r[3]} for r in rows]


def aggregate(jobs, group_by="company", top=15, now=None, **filters):
    """Counts by company / city / country / category / term over the filtered set."""
    for k in ("limit", "offset", "sort"):
        filters.pop(k, None)
    hits = match(jobs, now=now, **filters)
    c = Counter()
    for *_, j, matched in hits:
        if group_by == "company":
            c[j.get("company") or "?"] += 1
        elif group_by == "category":
            c[j.get("category") or "Uncategorised"] += 1
        elif group_by == "term":
            for t in j.get("terms") or ["Not stated"]:
                c[t] += 1
        elif group_by == "country":
            for k in {loc_country(l) or "other" for l in j.get("locations") or []}:
                c[k] += 1
        else:  # city
            for l in (matched or j.get("locations") or []):
                c[l] += 1
    return {"total": len(hits), "group_by": group_by, "counts": c.most_common(max(1, min(int(top or 15), 50)))}


def insights(jobs, *, now=None, days=30, **filters):
    """Shape of the matching market, for charts: new roles per day, fit spread, who's hiring and where."""
    now = now or time.time()
    hits = match(jobs, now=now, **filters)
    seen, uniq = set(), []
    for h in hits:
        j = h[3]
        k = (norm(j.get("company")), norm(j.get("title")), norm((j.get("locations") or [""])[0]))
        if k not in seen:
            seen.add(k)
            uniq.append(h)
    by_day = [0] * days
    fit_bins = [0] * 5          # <60, 60s, 70s, 80s, 90+
    companies, cities = {}, {}
    remote = onsite = 0
    for _, posted, fit, j, ml in uniq:
        if posted:
            age = int((now - posted) // 86400)
            if 0 <= age < days:
                by_day[days - 1 - age] += 1
        if fit:
            fit_bins[0 if fit < 60 else min(4, (int(fit) - 50) // 10)] += 1
        c = (j.get("company") or "").strip()
        if c:
            companies[c] = companies.get(c, 0) + 1
        if j.get("remote") or any(REMOTE_RE.search(l) for l in j.get("locations") or []):
            remote += 1
        else:
            onsite += 1
        first = (ml or j.get("locations") or [None])[0]
        if first and not REMOTE_RE.search(first):
            city = first.split(",")[0].strip()
            cities[city] = cities.get(city, 0) + 1
    top = lambda d, n: [{"name": k, "count": v} for k, v in sorted(d.items(), key=lambda kv: -kv[1])[:n]]
    start = date.fromtimestamp(now - (days - 1) * 86400).isoformat()
    return {"total": len(uniq), "start": start, "by_day": by_day, "fit_bins": fit_bins,
            "companies": top(companies, 6), "cities": top(cities, 6), "remote": remote, "onsite": onsite}
