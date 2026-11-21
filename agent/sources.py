"""Job sources. Each fetcher returns a list of normalized Job dicts.

Job dict fields:
  id, source, company, title, url, locations (list[str]), terms (list[str]),
  remote (bool), posted (unix seconds or None), sponsorship (str|None), stipend (str|None)
"""
from __future__ import annotations

import logging
import re
import time

import requests

log = logging.getLogger("sources")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 internship-alert-bot",
    "Accept-Language": "en-US,en;q=0.9",
}
INTERN_RE = re.compile(r"\b(intern|interns|internship|co-?op|trainee|apprentice(ship)?)\b", re.I)


def _get(url, **kw):
    r = requests.get(url, headers=HEADERS, timeout=30, **kw)
    r.raise_for_status()
    return r


# ── 1. SimplifyJobs Summer 2027 list (GitHub, community-maintained, 1000s of US companies) ──
SIMPLIFY_FEEDS = [
    "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
]


RAW = []   # last full feed (open + closed listings), used for opening dates and repost signals


def fetch_simplify():
    jobs = []
    RAW.clear()
    for feed in SIMPLIFY_FEEDS:
        data = _get(feed).json()
        RAW.extend(data)
        for x in data:
            if not x.get("active") or not x.get("is_visible", True):
                continue
            locs = x.get("locations") or []
            jobs.append({
                "_raw_id": x["id"],
                "id": f"simplify:{x['id']}",
                "source": "Simplify",
                "company": x.get("company_name", "").strip(),
                "title": x.get("title", "").strip(),
                "url": x.get("url"),
                "locations": locs,
                "terms": [t for t in (x.get("terms") or []) if t != "N/A"],
                "remote": any("remote" in l.lower() for l in locs),
                "posted": x.get("date_posted"),
                "sponsorship": x.get("sponsorship"),
                "category": x.get("category"),
                "degrees": x.get("degrees") or [],
                "stipend": None,
            })
    return jobs


# ── 2. Company career boards (Greenhouse / Lever / Ashby public JSON APIs) ──
def _iso_to_ts(s):
    if not s:
        return None
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
    except Exception:
        return None


def fetch_greenhouse(token):
    data = _get(f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs").json()
    out = []
    for j in data.get("jobs", []):
        if not INTERN_RE.search(j.get("title", "")):
            continue
        loc = (j.get("location") or {}).get("name", "") or ""
        out.append({
            "id": f"gh:{token}:{j['id']}", "source": "Greenhouse", "company": token.title(),
            "title": j["title"].strip(), "url": j.get("absolute_url"),
            "locations": [l.strip() for l in re.split(r";|\|| or ", loc) if l.strip()] or [loc],
            "terms": [], "remote": "remote" in loc.lower(),
            "posted": _iso_to_ts(j.get("first_published") or j.get("updated_at")),
            "sponsorship": None, "stipend": None,
        })
    return out


def fetch_lever(token):
    data = _get(f"https://api.lever.co/v0/postings/{token}?mode=json").json()
    out = []
    for j in data:
        cats = j.get("categories") or {}
        title = j.get("text", "")
        if not (INTERN_RE.search(title) or INTERN_RE.search(cats.get("commitment") or "")):
            continue
        locs = cats.get("allLocations") or [cats.get("location") or ""]
        out.append({
            "id": f"lever:{token}:{j['id']}", "source": "Lever", "company": token.replace("-", " ").title(),
            "title": title.strip(), "url": j.get("hostedUrl"), "locations": locs, "terms": [],
            "remote": (j.get("workplaceType") == "remote") or any("remote" in l.lower() for l in locs),
            "posted": int(j["createdAt"] / 1000) if j.get("createdAt") else None,
            "sponsorship": None, "stipend": None,
        })
    return out


def fetch_ashby(token):
    data = _get(f"https://api.ashbyhq.com/posting-api/job-board/{token}").json()
    out = []
    for j in data.get("jobs", []):
        if not (INTERN_RE.search(j.get("title", "")) or j.get("employmentType") == "Intern"):
            continue
        locs = [j.get("location") or ""] + [s.get("location", "") for s in j.get("secondaryLocations") or []]
        out.append({
            "id": f"ashby:{token}:{j.get('id')}", "source": "Ashby", "company": token.title(),
            "title": j["title"].strip(), "url": j.get("jobUrl"), "locations": [l for l in locs if l],
            "terms": [], "remote": bool(j.get("isRemote")),
            "posted": _iso_to_ts(j.get("publishedAt")), "sponsorship": None, "stipend": None,
        })
    return out


ATS = {"greenhouse": fetch_greenhouse, "lever": fetch_lever, "ashby": fetch_ashby}


def fetch_company_boards(companies: dict, health: dict):
    jobs = []
    for kind, tokens in (companies or {}).items():
        fn = ATS.get(kind)
        if not fn:
            continue
        for token in tokens or []:
            key = f"{kind}:{token}"
            try:
                got = fn(token)
                jobs.extend(got)
                health[key] = "ok"
            except requests.HTTPError as e:
                health[key] = f"HTTP {e.response.status_code} (board name probably wrong)"
            except Exception as e:  # network hiccup etc.
                health[key] = f"error: {type(e).__name__}"
            time.sleep(0.3)
    return jobs


# ── 3. Internshala (India) ──
INTERNSHALA_PAGES = [
    "https://internshala.com/internships/work-from-home-computer-science-internships/",
    "https://internshala.com/internships/work-from-home-machine-learning-internships/",
    "https://internshala.com/internships/work-from-home-software-development-internships/",
    "https://internshala.com/internships/work-from-home-python-django-internships/",
    "https://internshala.com/internships/work-from-home-data-science-internships/",
    "https://internshala.com/internships/computer-science-internship-in-bangalore/",
    "https://internshala.com/internships/machine-learning-internship-in-bangalore/",
    "https://internshala.com/internships/software-development-internship-in-bangalore/",
]


def _text(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)) if el else ""


def fetch_internshala():
    from bs4 import BeautifulSoup
    jobs, seen = [], set()
    for page in INTERNSHALA_PAGES:
        try:
            html = _get(page).text
        except Exception as e:
            log.warning("internshala %s: %s", page, e)
            continue
        soup = BeautifulSoup(html, "html.parser")
        cards = soup.select("div.individual_internship[internshipid]") or soup.select("div.individual_internship")
        if not cards:
            log.warning("internshala %s: no listings found (page was %d bytes)", page, len(html))
        for c in cards:
            iid = c.get("internshipid") or c.get("data-internship_id") or ""
            a = c.select_one("a.job-title-href") or c.select_one("h3 a") or c.select_one("a[href*='/internship/detail/']")
            href = (a.get("href") if a else None) or c.get("data-href") or ""
            if not href:
                continue
            url = href if href.startswith("http") else "https://internshala.com" + href
            iid = iid or url
            if iid in seen:
                continue
            seen.add(iid)
            title = _text(a) or _text(c.select_one(".job-internship-name"))
            company = _text(c.select_one(".company-name")) or _text(c.select_one(".company_name"))
            loc_txt = _text(c.select_one(".locations")) or _text(c.select_one("#location_names"))
            wfh = "work from home" in (loc_txt + " " + page).lower() or "work-from-home" in page
            stipend = _text(c.select_one(".stipend"))
            body = _text(c).lower()
            jobs.append({
                "id": f"internshala:{iid}", "source": "Internshala", "company": company,
                "title": title, "url": url,
                "locations": ["Remote (India)"] if wfh else [l.strip() for l in loc_txt.split(",") if l.strip()] or ["India"],
                "terms": [], "remote": wfh, "posted": None, "sponsorship": None,
                "stipend": stipend or None, "india_only": True, "raw_text": body[:600],
            })
        time.sleep(1.0)
    return jobs
