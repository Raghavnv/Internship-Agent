"""One-off: when did each company first post Summer internships in past cycles?

Reads old snapshots of SimplifyJobs' listings.json (from that repo's git history) and writes
agent/openings_history.json: {company_key: {"name": display, "cycles": {"2024": "YYYY-MM-DD", ...}, "clipped": [...]}}.
A date is "clipped" when it equals the first day the snapshot covers, i.e. the company may have opened earlier.

Usage (needs git):
  git clone --filter=blob:none --no-checkout https://github.com/SimplifyJobs/Summer2027-Internships.git /tmp/simp
  python agent/build_history.py /tmp/simp
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from .signals import company_key, opened_on

PATH = ".github/scripts/listings.json"
# (snapshot date, cycles it reliably covers)
SNAPSHOTS = [("2025-03-01", ["2024", "2025"]), ("2026-03-20", ["2026"])]


def snapshot(repo: str, until: str):
    sha = subprocess.check_output(["git", "-C", repo, "log", "-1", "--format=%h", f"--until={until}", "--", PATH], text=True).strip()
    return json.loads(subprocess.check_output(["git", "-C", repo, "show", f"{sha}:{PATH}"]))


def build(repo: str) -> dict:
    posts: dict = defaultdict(lambda: defaultdict(list))
    names: dict = defaultdict(Counter)
    clipped: dict = defaultdict(set)
    for until, cycles in SNAPSHOTS:
        data = snapshot(repo, until)
        floor = min(x["date_posted"] for x in data if x.get("date_posted"))
        for x in data:
            ts, co = x.get("date_posted"), (x.get("company_name") or "").strip()
            if not ts or not co:
                continue
            for t in x.get("terms") or []:
                if not t.startswith("Summer "):
                    continue
                cyc = t.split()[1]
                if cyc not in cycles:
                    continue
                k = company_key(co)
                names[k][co] += 1
                posts[k][cyc].append(ts)
        for k, by_cyc in posts.items():
            for cyc in cycles:
                if cyc in by_cyc and opened_on(by_cyc[cyc]) - floor < 3 * 86400:
                    clipped[k].add(cyc)
    out = {}
    for k, by_cyc in posts.items():
        out[k] = {"name": names[k].most_common(1)[0][0],
                  "cycles": {c: date.fromtimestamp(opened_on(ts)).isoformat() for c, ts in sorted(by_cyc.items())}}
        if clipped[k]:
            out[k]["clipped"] = sorted(clipped[k])
    return out


if __name__ == "__main__":
    hist = build(sys.argv[1])
    dest = Path(__file__).parent / "openings_history.json"
    dest.write_text(json.dumps(hist, separators=(",", ":"), ensure_ascii=False, sort_keys=True))
    print(f"{len(hist)} companies -> {dest}")
