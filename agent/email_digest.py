"""Morning email for every Internship Copilot user who has it switched on.

Run by .github/workflows/digest.yml once a day. For each person it collects:
  - up to five strong new matches since their last email,
  - roles that fit them and close within the week,
  - companies they watch that opened recently,
  - interviews in the next two days and follow-ups that are due.
Nobody gets an email on a day with nothing in it.

Needs (GitHub secrets): SUPABASE_URL, SUPABASE_SECRET_KEY (or the older service_role key),
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and optionally DIGEST_FROM and APP_URL.
"""
from __future__ import annotations

import argparse
import html
import logging
import os
import re
import smtplib
import sys
import time
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app" / "backend"))
import deadlines  # noqa: E402
import fit as fitlib  # noqa: E402
import market  # noqa: E402

log = logging.getLogger("digest")
IST = timezone(timedelta(hours=5, minutes=30))
DATA = "https://raw.githubusercontent.com/Raghavnv/Internship-Agent/data/"
APP_URL = os.getenv("APP_URL", "").rstrip("/") or "https://internship-copilot.vercel.app"
STRONG = 60


# ── Supabase (service access: reads every profile, so this key only lives in GitHub secrets) ──
class DB:
    def __init__(self, url, key):
        self.url = url.rstrip("/")
        # new sb_secret_ keys aren't JWTs: the Authorization header must equal apikey exactly
        self.h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def rows(self, table, query):
        r = requests.get(f"{self.url}/rest/v1/{table}?{query}", headers=self.h, timeout=30)
        r.raise_for_status()
        return r.json()

    def emails(self):
        out, page = {}, 1
        while True:
            r = requests.get(f"{self.url}/auth/v1/admin/users", params={"page": page, "per_page": 500},
                             headers=self.h, timeout=30)
            r.raise_for_status()
            users = r.json().get("users") or []
            out.update({u["id"]: u.get("email") for u in users if u.get("email")})
            if len(users) < 500:
                return out
            page += 1

    def mark_sent(self, uid):
        requests.patch(f"{self.url}/rest/v1/profiles?id=eq.{uid}", headers=self.h, timeout=30,
                       json={"digest_sent_at": datetime.now(timezone.utc).isoformat()})


def load(name):
    r = requests.get(DATA + name, params={"t": int(time.time())}, timeout=60)
    r.raise_for_status()
    return r.json()


# ── what goes in one person's email ─────────────────────────────────────
def build(profile, apps, jobs, openings, now=None):
    now = now or time.time()
    today = datetime.fromtimestamp(now, IST).date()
    sent = profile.get("digest_sent_at")
    since = datetime.fromisoformat(sent.replace("Z", "+00:00")).timestamp() if sent else now - 86400
    since = max(since, now - 3 * 86400)            # after a long gap, still only the last few days
    prof = fitlib.prepare(profile)
    applied = {a.get("job_id") for a in apps}

    scored = []
    for j in jobs:
        if j["id"] in applied or (j.get("closes") and j["closes"] < now):
            continue
        if market.freshness(j, now)["level"] == "ghost":
            continue
        s = fitlib.score(j, prof, now)[0] or 0
        if s >= STRONG:
            scored.append((s, j))
    new, keys = [], set()
    for x in sorted([x for x in scored if max(x[1].get("first_seen") or 0, x[1].get("posted") or 0) > since],
                    key=lambda x: -x[0]):
        k = ((x[1].get("company") or "").lower(), frozenset(re.findall(r"[a-z]+", (x[1].get("title") or "").lower())))
        if k not in keys:                 # the same role posted on two boards counts once
            keys.add(k)
            new.append(x)
    new = new[:5]
    shown = {j["id"] for _, j in new}
    closing = sorted([x for x in scored if x[1].get("closes") and x[1]["id"] not in shown
                      and x[1]["closes"] - now <= 7 * 86400], key=lambda x: x[1]["closes"])[:3]

    opened, since_day = [], datetime.fromtimestamp(since, IST).date()
    for name in profile.get("watch_companies") or []:
        o = market.opening(openings, name, today)
        if o and o["status"] == "open" and o.get("opened_on") and \
                date.fromisoformat(o["opened_on"][:10]) >= since_day:
            opened.append(o.get("company") or name)

    todo = []
    for a in apps:
        if a.get("status") in ("Offer", "Rejected"):
            continue
        iv = a.get("interview_at")
        if iv:
            at = datetime.fromisoformat(iv.replace("Z", "+00:00")).astimezone(IST)
            if today <= at.date() <= today + timedelta(days=2):
                todo.append(("Interview", a, at.strftime("%a %d %b, %I:%M %p").replace(" 0", " ")))
        fu = a.get("follow_up_on")
        if fu and date.fromisoformat(fu) <= today:
            late = (today - date.fromisoformat(fu)).days
            todo.append(("Follow up", a, "due today" if not late else f"{late} day{'s' if late > 1 else ''} overdue"))
    return {"new": new, "closing": closing, "opened": opened, "todo": todo}


def empty(d):
    return not (d["new"] or d["closing"] or d["opened"] or d["todo"])


def subject(d):
    bits = []
    if d["todo"]:
        iv = sum(1 for t in d["todo"] if t[0] == "Interview")
        bits.append(f"{iv} interview{'s' if iv > 1 else ''} coming up" if iv else "follow-ups due")
    if d["opened"]:
        bits.append(f"{d['opened'][0]} just opened")
    if d["new"]:
        bits.append(f"{len(d['new'])} new match{'es' if len(d['new']) > 1 else ''}")
    if d["closing"] and len(bits) < 2:
        bits.append("deadlines this week")
    return ("Today: " + ", ".join(bits[:2]))[:90]


# ── rendering: plain, light, works in every mail app ─────────────────────
C = {"ink": "#1d2427", "muted": "#5f6b69", "line": "#e4e1d8", "accent": "#c46f22", "bg": "#f6f4ef"}


def _job_row(score, j, note=""):
    loc = (j.get("locations") or ["Remote" if j.get("remote") else ""])[0]
    e = html.escape
    return (f'<tr><td style="padding:10px 0;border-top:1px solid {C["line"]}">'
            f'<a href="{e(j.get("url") or APP_URL)}" style="color:{C["ink"]};font-weight:600;text-decoration:none">{e(j.get("title") or "")}</a>'
            f'<div style="color:{C["muted"]};font-size:13px;margin-top:2px">{e(j.get("company") or "")}'
            f'{" · " + e(loc) if loc else ""}{" · " + e(note) if note else ""}</div></td>'
            f'<td style="padding:10px 0 10px 12px;border-top:1px solid {C["line"]};text-align:right;'
            f'color:{C["accent"]};font-weight:600;white-space:nowrap">{score}</td></tr>')


def _section(title, rows):
    return (f'<h2 style="font-size:15px;margin:26px 0 6px;color:{C["ink"]}">{title}</h2>'
            f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px">{rows}</table>')


def render(name, d):
    e = html.escape
    parts = []
    if d["todo"]:
        rows = "".join(
            f'<tr><td style="padding:9px 0;border-top:1px solid {C["line"]}"><strong>{k}: {e(a.get("company") or "")}</strong>'
            f'<div style="color:{C["muted"]};font-size:13px;margin-top:2px">{e(a.get("title") or "")} · {e(when)}</div></td></tr>'
            for k, a, when in d["todo"])
        parts.append(_section("On your list", rows))
    if d["opened"]:
        rows = "".join(
            f'<tr><td style="padding:9px 0;border-top:1px solid {C["line"]}"><a href="{APP_URL}/app/explore?q={e(c)}" '
            f'style="color:{C["ink"]};font-weight:600;text-decoration:none">{e(c)}</a>'
            f'<div style="color:{C["muted"]};font-size:13px;margin-top:2px">Internship applications just opened. Early applicants are read first.</div></td></tr>'
            for c in d["opened"])
        parts.append(_section("Companies you watch", rows))
    if d["new"]:
        parts.append(_section("New since yesterday", "".join(_job_row(s, j) for s, j in d["new"])))
    if d["closing"]:
        parts.append(_section("Closing this week", "".join(
            _job_row(s, j, deadlines_note(j)) for s, j in d["closing"])))
    hello = f"Morning{', ' + e(name.split()[0]) if name else ''}."
    return f"""<!doctype html><html><body style="margin:0;background:{C['bg']}">
<div style="max-width:560px;margin:0 auto;padding:28px 22px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:{C['ink']};line-height:1.45">
<p style="font-size:17px;font-weight:600;margin:0 0 4px">{hello}</p>
<p style="color:{C['muted']};margin:0;font-size:14px">Here's what changed in your internship search. The number beside each role is how well it fits you, out of 100.</p>
{''.join(parts)}
<p style="margin:28px 0 0"><a href="{APP_URL}/app" style="display:inline-block;background:{C['accent']};color:#fff;text-decoration:none;padding:9px 16px;border-radius:7px;font-weight:600;font-size:14px">Open Internship Copilot</a></p>
<p style="color:{C['muted']};font-size:12px;margin:26px 0 0">You get this on days with something new. Turn it off under Profile → Morning email: <a href="{APP_URL}/app/profile" style="color:{C['muted']}">{APP_URL}/app/profile</a></p>
</div></body></html>"""


def deadlines_note(j):
    n = deadlines.days_left(j.get("closes"))
    return "closes today" if n == 0 else "closes tomorrow" if n == 1 else f"closes in {n} days"


def plain(name, d):
    out = [f"Morning{', ' + name.split()[0] if name else ''}.", ""]
    for k, a, when in d["todo"]:
        out.append(f"- {k}: {a.get('company')} ({a.get('title')}), {when}")
    for c in d["opened"]:
        out.append(f"- {c} just opened internship applications")
    if d["new"]:
        out += ["", "New since yesterday:"] + [f"- {j['title']} at {j['company']} (fit {s}): {j.get('url')}" for s, j in d["new"]]
    if d["closing"]:
        out += ["", "Closing this week:"] + [f"- {j['title']} at {j['company']}, {deadlines_note(j)}: {j.get('url')}" for s, j in d["closing"]]
    out += ["", f"Open the app: {APP_URL}/app", f"Turn these emails off: {APP_URL}/app/profile"]
    return "\n".join(out)


def send(smtp, sender, to, subj, html_body, text_body):
    m = EmailMessage()
    m["Subject"], m["From"], m["To"] = subj, sender, to
    m.set_content(text_body)
    m.add_alternative(html_body, subtype="html")
    smtp.send_message(m)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="build the emails and print them; send nothing")
    ap.add_argument("--only", help="send to this one email address (for testing)")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        log.warning("SUPABASE_URL / SUPABASE_SECRET_KEY not set: no digest sent.")
        return 0
    db = DB(url, key)
    jobs = load("jobs.json").get("jobs") or []
    try:
        openings = load("openings.json")
    except Exception:
        openings = {}
    try:
        profiles = db.rows("profiles", "select=*&onboarded=eq.true&or=(digest_email.is.null,digest_email.eq.true)")
    except requests.HTTPError:            # schema v6 not run yet: everyone is opted in
        profiles = db.rows("profiles", "select=*&onboarded=eq.true")
    apps = db.rows("applications", "select=user_id,job_id,company,title,status,interview_at,follow_up_on")
    emails = db.emails()
    by_user = {}
    for x in apps:
        by_user.setdefault(x["user_id"], []).append(x)

    smtp = None
    if not a.dry_run:
        host, user, pw = os.getenv("SMTP_HOST") or "smtp.gmail.com", os.getenv("SMTP_USER"), os.getenv("SMTP_PASS")
        if not user or not pw:
            log.warning("SMTP_USER / SMTP_PASS not set: no digest sent.")
            return 0
        smtp = smtplib.SMTP(host, int(os.getenv("SMTP_PORT") or "587"), timeout=30)
        smtp.starttls()
        smtp.login(user, pw)
    sender = formataddr(("Internship Copilot", os.getenv("DIGEST_FROM") or os.getenv("SMTP_USER") or "digest@localhost"))

    sent = 0
    for p in profiles:
        to = emails.get(p["id"])
        if not to or (a.only and to.lower() != a.only.lower()):
            continue
        d = build(p, by_user.get(p["id"], []), jobs, openings)
        if empty(d):
            log.info("%s: nothing new today", to)
            continue
        subj = subject(d)
        if a.dry_run:
            print(f"--- {to}: {subj}\n{plain(p.get('full_name') or '', d)}\n")
            continue
        try:
            send(smtp, sender, to, subj, render(p.get("full_name") or "", d), plain(p.get("full_name") or "", d))
            db.mark_sent(p["id"])
            sent += 1
        except Exception as e:
            log.warning("couldn't email %s: %s", to, e)
    if smtp:
        smtp.quit()
    log.info("digest: %d email%s sent", sent, "" if sent == 1 else "s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
