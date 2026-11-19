"""Find an application deadline in a job description or listing card.

Only dates that sit right after a deadline phrase count ("apply by", "applications close",
"deadline"), so start dates and event dates in the same text are ignored.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
MON = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
YEAR = r"(?:,?\s*'?\s*(\d{4}|\d{2})\b)?"
DAY = r"(\d{1,2})(?:st|nd|rd|th)?"

CUE = re.compile(
    r"(apply\s+by|apply\s+before|deadline(?:\s+to\s+apply)?|applications?\s+(?:will\s+)?(?:close|closes|are\s+due|due|accepted\s+(?:until|through))"
    r"|closing\s+date|last\s+date(?:\s+to\s+apply)?|submit\s+(?:your\s+)?(?:application|resume)s?\s+(?:by|before)"
    r"|accepting\s+applications\s+(?:until|through)|open\s+until|posting\s+(?:closes|ends))",
    re.I)
DATES = [
    ("mdy", re.compile(MON + r"\s+" + DAY + YEAR, re.I)),           # December 5, 2026 / Dec 5
    ("dmy", re.compile(DAY + r"\s+(?:of\s+)?" + MON + YEAR, re.I)),  # 5 December 2026 / 5th Dec' 26
    ("iso", re.compile(r"(\d{4})-(\d{2})-(\d{2})")),
]
ROLLING = re.compile(r"rolling\s+basis|until\s+filled", re.I)


def _mk(y, m, d, today):
    try:
        if y:
            y = int(y)
            y = y + 2000 if y < 100 else y
            return date(y, m, d)
        got = date(today.year, m, d)
        return got if got >= today - timedelta(days=30) else date(today.year + 1, m, d)
    except ValueError:
        return None


def _date_after(text: str, today: date):
    best = None
    for kind, rx in DATES:
        m = rx.search(text)
        if not m or (best and m.start() >= best[0]):
            continue
        g = m.groups()
        if kind == "mdy":
            d = _mk(g[2], MONTHS[g[0][:3].lower()], int(g[1]), today)
        elif kind == "dmy":
            d = _mk(g[2], MONTHS[g[1][:3].lower()], int(g[0]), today)
        else:
            d = _mk(g[0], int(g[1]), int(g[2]), today)
        if d:
            best = (m.start(), d)
    return best[1] if best else None


def find(text: str, today: date | None = None) -> date | None:
    """The deadline the text states, or None. Past dates and ones over 9 months out are ignored."""
    if not text:
        return None
    today = today or datetime.now(timezone.utc).date()
    for m in CUE.finditer(text):
        window = text[m.end(): m.end() + 60]
        if ROLLING.match(window.strip(" :-–—")):
            continue
        d = _date_after(window, today)
        if d and today - timedelta(days=1) <= d <= today + timedelta(days=270):
            return d
    return None


def from_blocks(blocks: list[dict] | None, today: date | None = None) -> date | None:
    return find(" \n".join(b.get("text", "") for b in blocks or []), today)


def to_ts(d: date | None) -> int | None:
    """End of that day, India time (the deadline stays open all day)."""
    if not d:
        return None
    return int(datetime(d.year, d.month, d.day, 23, 59, tzinfo=timezone(timedelta(hours=5, minutes=30))).timestamp())


def days_left(ts: int | None, now: float | None = None) -> int | None:
    if not ts:
        return None
    now = now or datetime.now(timezone.utc).timestamp()
    end = datetime.fromtimestamp(ts, timezone(timedelta(hours=5, minutes=30))).date()
    today = datetime.fromtimestamp(now, timezone(timedelta(hours=5, minutes=30))).date()
    return (end - today).days
