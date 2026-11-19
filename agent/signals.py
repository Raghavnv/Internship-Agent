"""Signals computed from the full SimplifyJobs feed (open *and* closed listings):

- openings: when each company first posted Summer internships this cycle, next to past cycles,
  so the app can say "opened 14 Aug" or "usually opens around 3 Sep".
- reposts: how many times the same company + title was posted before (closed, then posted again).
(The feed's "date_updated" changes on any edit, so it can't tell us when a listing closed.)
"""
from __future__ import annotations

import json
import re
import statistics
from collections import defaultdict
from datetime import date
from pathlib import Path

HISTORY = Path(__file__).parent / "openings_history.json"
_SUFFIX = re.compile(r"\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|technologies|technology|labs?|group|holdings)\b\.?")


def company_key(name: str) -> str:
    k = (name or "").lower().replace("&", " and ")
    k = re.sub(r"\(.*?\)", " ", k)
    k = _SUFFIX.sub(" ", k)
    return re.sub(r"[^a-z0-9]+", " ", k).strip()


def title_key(title: str) -> str:
    t = (title or "").lower()
    t = re.sub(r"\b(summer|fall|winter|spring)\b\s*\d{0,4}|\b20\d\d\b|\(.*?\)|[-–—:|,/]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def current_cycle(raw) -> str:
    """The Summer cycle most open listings are for (a stray 'Summer 2029' mustn't win)."""
    from collections import Counter
    c = Counter(t.split()[1] for x in raw if x.get("active") for t in (x.get("terms") or [])
                if t.startswith("Summer ") and t.split()[1].isdigit())
    return c.most_common(1)[0][0] if c else str(date.today().year + 1)


def opened_on(timestamps):
    """When a company really 'opened': its 3rd posting if it has 6+, 2nd if 3+, else the first.
    One stray early listing shouldn't move the whole season."""
    ts = sorted(timestamps)
    k = 3 if len(ts) >= 6 else 2 if len(ts) >= 3 else 1
    return ts[k - 1]


def openings(raw, history=None) -> dict:
    """{company_key: {"name", "cycles": {"2024": iso, ...}, "clipped": [...]}} including the current cycle."""
    if history is None:
        history = json.loads(HISTORY.read_text()) if HISTORY.exists() else {}
    out = {k: {**v, "cycles": dict(v["cycles"])} for k, v in history.items()}
    cyc = current_cycle(raw)
    posts: dict = defaultdict(list)
    names: dict = {}
    for x in raw:
        ts, co = x.get("date_posted"), (x.get("company_name") or "").strip()
        if not ts or not co or f"Summer {cyc}" not in (x.get("terms") or []):
            continue
        k = company_key(co)
        names.setdefault(k, co)
        posts[k].append(ts)
    for k, ts in posts.items():
        rec = out.setdefault(k, {"name": names[k], "cycles": {}})
        rec["cycles"][cyc] = date.fromtimestamp(opened_on(ts)).isoformat()
    return {"cycle": cyc, "companies": out}


def reposts(raw, gap_days=7):
    """listing id -> how many times the same company + title was posted, closed, and posted again.
    Only earlier postings that have since *closed* count, so a company listing one title for many
    teams at once (all still open) isn't mistaken for reposting."""
    by_role = defaultdict(list)
    for x in raw:
        co, ts = company_key(x.get("company_name")), x.get("date_posted")
        if co and ts:
            by_role[(co, title_key(x.get("title")))].append((ts, x.get("id"), bool(x.get("active"))))
    out = {}
    for posts in by_role.values():
        posts.sort()
        for ts, lid, _active in posts:
            # count distinct earlier, now-closed posting "waves" (not one role listed for several cities on one day)
            waves, last = 0, None
            for t2, _, still_open in posts:
                if t2 > ts - gap_days * 86400:
                    break
                if still_open:
                    continue
                if last is None or t2 - last >= gap_days * 86400:
                    waves += 1
                    last = t2
            out[lid] = waves
    return out
