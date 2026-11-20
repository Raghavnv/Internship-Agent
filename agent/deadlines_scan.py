"""Read application deadlines out of job descriptions, a few dozen new listings per run.

Each listing is read once; the answer (a date, or 0 for "none stated") is kept in state so later
runs skip it. Uses the web app's description fetcher so both read the same pages the same way.
"""
from __future__ import annotations

import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app" / "backend"))
import deadlines  # noqa: E402

log = logging.getLogger("deadlines")
PER_RUN = 20
BUDGET_S = 75


def scan(jobs: list[dict], st: dict) -> dict:
    """Fill st['deadlines'] for listings not read yet; return {job id: deadline unix time}."""
    known = st.setdefault("deadlines", {})
    live = {j["id"] for j in jobs}
    for k in [k for k in known if k not in live]:
        del known[k]
    # listing cards that state a date (Internshala "Apply by ...") need no fetch
    for j in jobs:
        if j["id"] not in known and j.get("raw_text"):
            d = deadlines.find(j["raw_text"])
            if d:
                known[j["id"]] = deadlines.to_ts(d)
    try:
        import jobdetail
    except Exception as e:  # httpx missing etc.: deadlines are a bonus, never break the run
        log.warning("deadline scan skipped: %s", e)
        return {k: v for k, v in known.items() if v}
    todo = [j for j in jobs if j["id"] not in known and jobdetail.provider(j.get("url") or "")[1]]
    todo.sort(key=lambda j: -(j.get("posted") or 0))
    todo = todo[:PER_RUN]
    start, found = time.time(), 0

    def read(j):
        d = jobdetail.description(j["url"])
        return j["id"], (deadlines.to_ts(deadlines.from_blocks(d["blocks"])) if d else None), d is not None

    with ThreadPoolExecutor(4) as ex:
        futs = [ex.submit(read, j) for j in todo]
        for f in as_completed(futs):
            if time.time() - start > BUDGET_S:
                break
            try:
                jid, ts, ok = f.result()
            except Exception:
                continue
            if ok or ts:
                known[jid] = ts or 0
                found += bool(ts)
    log.info("deadlines: read %d descriptions, %d state a deadline (%d known overall)",
             len(todo), found, sum(1 for v in known.values() if v))
    return {k: v for k, v in known.items() if v}
