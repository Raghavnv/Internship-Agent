"""Internship alert agent: fetch -> filter -> alert new matches on WhatsApp.

Usage:
  python -m agent.main            # normal run (used by GitHub Actions)
  python -m agent.main --dry-run  # print messages instead of sending; don't save state
  python -m agent.main --test     # send one test WhatsApp message and exit
  python -m agent.main --digest   # force today's digest now
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from . import sources
from .matcher import Matcher
from .notify import Notifier, flatten

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "state" / "state.json"
IST = timezone(timedelta(hours=5, minutes=30))
log = logging.getLogger("agent")


def load_state():
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"seen": {}, "digest_queue": [], "last_digest": None, "source_counts": {}, "warned": {}}


def save_state(st):
    cutoff = time.time() - 150 * 86400
    st["seen"] = {k: v for k, v in st["seen"].items() if v > cutoff}
    STATE.parent.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(st, indent=0, sort_keys=True))


def collect(cfg, companies, health):
    jobs = []
    for name, fn in [("simplify", sources.fetch_simplify), ("internshala", sources.fetch_internshala)]:
        try:
            got = fn()
            health[name] = f"ok ({len(got)} listings)"
            jobs.extend(got)
        except Exception as e:
            health[name] = f"error: {type(e).__name__}: {e}"[:200]
            log.exception("source %s failed", name)
    jobs.extend(sources.fetch_company_boards(companies, health))
    # de-duplicate the same posting found via several sources (same URL)
    uniq = {}
    for j in jobs:
        key = (j.get("url") or j["id"]).split("?")[0].rstrip("/").lower()
        uniq.setdefault(key, j)
    return list(uniq.values())


def write_matches_page(matched):
    lines = ["# Open internships matching your profile",
             f"_Updated {datetime.now(IST):%d %b %Y, %I:%M %p} IST. {len(matched)} roles, best first._", "",
             "| Score | Role | Company | Location | Term | Apply |", "|---|---|---|---|---|---|"]
    for job, ev in matched:
        terms = ", ".join(job.get("terms", [])[:2]) or "?"
        title = job["title"].replace("|", "/")
        lines.append(f"| {ev['score']} | {title} | {job['company'].replace('|', '/')} | "
                     f"{(ev['loc'] or '').replace('|', '/')} | {terms} | [link]({job['url']}) |")
    (ROOT / "MATCHES.md").write_text("\n".join(lines) + "\n")


def export_jobs(jobs, evs, st, closes=None):
    """Full listing dump for the AI search app (published to the `data` branch by the workflow)."""
    keep = ("id", "source", "company", "title", "url", "locations", "terms", "remote", "posted",
            "sponsorship", "category", "degrees", "stipend")
    from . import signals
    try:
        reposts = signals.reposts(sources.RAW) if sources.RAW else {}
    except Exception as e:  # signals are extras; never break the run
        log.warning("repost signals failed: %s", e)
        reposts = {}
    out = []
    for j in jobs:
        rec = {k: j.get(k) for k in keep if j.get(k) not in (None, [], "")}
        if reposts.get(j.get("_raw_id")):
            rec["reposts"] = reposts[j["_raw_id"]]
        rec["first_seen"] = int(st["seen"].get(j["id"]) or time.time())
        if (closes or {}).get(j["id"], 0) > time.time() - 86400:
            rec["closes"] = closes[j["id"]]
        try:
            from .geo import geocode
            g = [geocode(l) for l in j.get("locations") or []]
            if any(g):
                rec["geo"] = [list(x) if x else None for x in g]
        except Exception:  # geocoding is a nice-to-have; never break the run
            pass
        ev = evs.get(j["id"])
        if ev:
            rec["fit"] = {"score": ev["score"], "bucket": ev["bucket"], "tags": ev["tags"]}
        out.append(rec)
    out.sort(key=lambda r: -(r.get("posted") or r["first_seen"]))
    d = ROOT / "data"
    d.mkdir(exist_ok=True)
    (d / "jobs.json").write_text(json.dumps({"updated": int(time.time()), "count": len(out), "jobs": out},
                                            separators=(",", ":"), ensure_ascii=False))
    if sources.RAW:
        try:
            op = signals.openings(sources.RAW)
            op["updated"] = int(time.time())
            (d / "openings.json").write_text(json.dumps(op, separators=(",", ":"), ensure_ascii=False))
        except Exception as e:
            log.warning("openings export failed: %s", e)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--digest", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    cfg = yaml.safe_load((ROOT / "config.yaml").read_text())
    companies = yaml.safe_load((ROOT / "companies.yaml").read_text())
    notifier = Notifier(dry_run=args.dry_run)

    if args.test:
        ok = notifier.send("👋 Hi Raghav! Your internship alert agent is connected. "
                           "You'll get new matching roles here as soon as they're posted.")
        print("channels:", notifier.channels() or "none configured (printed instead)", "ok:", ok)
        if not ok and notifier.meta_on():
            notifier.meta_diagnose()
        return 0 if ok else 1

    if not notifier.channels() and not args.dry_run:
        log.warning("No WhatsApp/Telegram secrets set yet: skipping this run (nothing saved). "
                    "Add the secrets from README.md and the next run will start normally.")
        return 0

    st = load_state()
    first_run = not st["seen"]
    health = {}
    jobs = collect(cfg, companies, health)
    m = Matcher(cfg)

    matched = []
    for j in jobs:
        ev = m.evaluate(j)
        if ev:
            matched.append((j, ev))
    matched.sort(key=lambda x: (-x[1]["score"], -(x[0].get("posted") or 0)))
    log.info("fetched %d listings, %d match your profile", len(jobs), len(matched))
    for k, v in sorted(health.items()):
        log.info("source %-28s %s", k, v)
    write_matches_page(matched)
    try:
        from . import deadlines_scan
        closes = deadlines_scan.scan(jobs, st)
    except Exception as e:  # deadlines are extras; never break the run
        log.warning("deadline scan failed: %s", e)
        closes = {}
    export_jobs(jobs, {j["id"]: ev for j, ev in matched}, st, closes)
    (ROOT / "STATUS.md").write_text(
        f"# Source status\n_Last run {datetime.now(IST):%d %b %Y, %I:%M %p} IST: "
        f"{len(jobs)} listings fetched, {len(matched)} match._\n\n| Source | Status |\n|---|---|\n"
        + "\n".join(f"| {k} | {v} |" for k, v in sorted(health.items())) + "\n")

    now = time.time()
    new = [(j, ev) for j, ev in matched if j["id"] not in st["seen"]]
    per = cfg["alerts"].get("jobs_per_message", 3)

    if first_run:
        top = [x for x in matched if m.is_instant(*x)][:9]
        n_inst = sum(1 for x in matched if m.is_instant(*x))
        intro = (f"🚀 *Internship alert agent is live!*\n"
                 f"I found {len(matched)} open roles that fit you right now ({n_inst} strong matches). "
                 f"Here are the top {len(top)}. The full list is in MATCHES.md in your repo.\n"
                 f"From now on you'll only get NEW postings, within ~15 min of them appearing, "
                 f"plus a digest at {cfg['alerts']['digest_hour_ist']}:00.")
        notifier.send(intro)
        notifier.send_jobs("⭐ Top open roles", top, per)
        if notifier.failures and not args.dry_run:
            log.error("Couldn't deliver the first-run messages (see warnings above). Not saving state, "
                      "so the next run tries again.")
            return 0
        for j, _ in matched:
            st["seen"][j["id"]] = now
    else:
        instant = [(j, ev) for j, ev in new if m.is_instant(j, ev)]
        later = [(j, ev) for j, ev in new if not m.is_instant(j, ev)]
        if instant:
            hdr = "🔥 *New internship just opened!*" if len(instant) == 1 else f"🔥 *{len(instant)} new internships just opened!*"
            before = notifier.failures
            notifier.send_jobs(hdr, instant, per)
            if notifier.failures > before:
                # delivery failed: leave these unseen so the next run retries them
                retry_ids = {j["id"] for j, _ in instant}
                new = [(j, ev) for j, ev in new if j["id"] not in retry_ids]
                log.warning("instant alerts failed; will retry %d jobs next run", len(retry_ids))
        for j, ev in later:
            st["digest_queue"].append({"job": {k: v for k, v in j.items() if k != "raw_text"}, "ev": ev})
        for j, _ in new:
            st["seen"][j["id"]] = now
        log.info("new: %d (instant %d, digest %d)", len(new), len(instant), len(later))

    # ── daily digest ──
    ist_now = datetime.now(IST)
    today = ist_now.strftime("%Y-%m-%d")
    due = ist_now.hour >= cfg["alerts"]["digest_hour_ist"] and st.get("last_digest") != today
    if (due or args.digest) and not first_run:
        q = sorted(st["digest_queue"], key=lambda x: -x["ev"]["score"])
        if q:
            items = [(x["job"], x["ev"]) for x in q[:15]]
            hdr = f"📰 *Daily digest*: {len(q)} other new roles (other cities / weaker fit)"
            if notifier.text_channels() or notifier.meta_on() or not notifier.aisensy_on():
                saved, notifier.ais_key = notifier.ais_key, None  # AiSensy handled compactly below
                notifier.send_jobs(hdr, items, per, compact_fallback=True)
                notifier.ais_key = saved
            if notifier.aisensy_on() and not notifier.dry:
                # one compact message instead of 15 paid template messages
                lines = [f"{j['title']} @ {j['company']} ({ev['loc']}) {j['url']}" for j, ev in items[:6]]
                notifier._retry("aisensy", notifier._aisensy, notifier.ais_text or notifier.ais_job,
                                [flatten(hdr + ": " + " • ".join(lines) +
                                         (f" …+{len(q) - 6} more in MATCHES.md" if len(q) > 6 else ""), 900)]
                                if notifier.ais_text else
                                ["Daily digest", f"{len(q)} new roles", "other cities / weaker fit",
                                 "Top: " + flatten(items[0][0]["title"] + " @ " + items[0][0]["company"], 200),
                                 "See MATCHES.md in your GitHub repo"])
        st["digest_queue"] = []
        st["last_digest"] = today

    # ── source health: warn once if a main source breaks for a day ──
    for name in ("simplify", "internshala"):
        ok = health.get(name, "").startswith("ok") and not health[name].startswith("ok (0 ")
        rec = st["source_counts"].setdefault(name, {"last_ok": now})
        if ok:
            rec["last_ok"] = now
            st["warned"].pop(name, None)
        elif now - rec["last_ok"] > 86400 and not st["warned"].get(name):
            notifier.send(f"⚠️ Heads up: the {name} source hasn't returned results for 24h "
                          f"(last status: {health.get(name)}). Other sources are still running.")
            st["warned"][name] = now

    if not args.dry_run:
        save_state(st)
    return 0


if __name__ == "__main__":
    sys.exit(main())
