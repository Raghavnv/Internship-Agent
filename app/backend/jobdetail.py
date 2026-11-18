"""Full job descriptions, fetched on demand from the employer's applicant-tracking system.

The listings feed only carries titles, places and dates. When someone opens a role we look the
posting up on its ATS (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Workable), turn the
HTML into plain blocks the frontend can render safely, and cache the result.
"""
from __future__ import annotations

import html
import logging
import re
import threading
import time
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

log = logging.getLogger("jobdetail")
TTL = 6 * 3600
MAX_BLOCKS = 160
MAX_CHARS = 16000
_cache: dict[str, tuple[float, dict | None]] = {}
_lock = threading.Lock()
HEADERS = {"User-Agent": "InternshipCopilot/1.0 (+https://github.com/Raghavnv/Internship-Agent)", "Accept": "application/json"}


# ── HTML → blocks ───────────────────────────────────────────
class _Blocks(HTMLParser):
    BLOCK = {"p", "div", "section", "br", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "table"}
    HEAD = {"h1", "h2", "h3", "h4", "h5", "h6"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[dict] = []
        self.buf: list[str] = []
        self.kind = "p"
        self.bold_only = True
        self.bold = 0
        self.skip = 0

    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if text:
            kind = self.kind
            # a short paragraph that is entirely bold reads as a heading ("What you'll do")
            if kind == "p" and self.bold_only and len(text) < 80 and not text.endswith("."):
                kind = "h"
            self.out.append({"type": kind, "text": text})
        self.bold_only = True

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in ("strong", "b"):
            self.bold += 1
        elif tag in self.BLOCK:
            self.flush()
            self.kind = "h" if tag in self.HEAD else "li" if tag == "li" else "p"

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        elif tag in ("strong", "b"):
            self.bold = max(0, self.bold - 1)
        elif tag in self.BLOCK:
            self.flush()
            self.kind = "p"

    def handle_data(self, data):
        if self.skip:
            return
        if data.strip() and not self.bold:
            self.bold_only = False
        self.buf.append(data)

    def close(self):
        super().close()
        self.flush()


def html_blocks(raw: str) -> list[dict]:
    if not raw:
        return []
    if "&lt;" in raw and "<" not in raw[:200]:   # Greenhouse double-escapes its HTML
        raw = html.unescape(raw)
    p = _Blocks()
    p.feed(raw)
    p.close()
    return _trim(p.out)


def text_blocks(raw: str) -> list[dict]:
    out = []
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^[-•*·]\s+(.*)", line)
        out.append({"type": "li", "text": m.group(1)} if m else {"type": "p", "text": line})
    return _trim(out)


def _trim(blocks):
    out, total = [], 0
    for b in blocks:
        if out and b == out[-1]:
            continue
        total += len(b["text"])
        if len(out) >= MAX_BLOCKS or total > MAX_CHARS:
            out.append({"type": "p", "text": "…"})
            break
        out.append(b)
    return out


# ── per-ATS fetchers ────────────────────────────────────────
def _get(url, **kw):
    r = httpx.get(url, headers=HEADERS, timeout=8, follow_redirects=True, **kw)
    r.raise_for_status()
    return r.json()


def _greenhouse(parts, q):
    # job-boards.greenhouse.io/{board}/jobs/{id}  or  boards.greenhouse.io/{board}/jobs/{id}
    if "jobs" in parts:
        i = parts.index("jobs")
        board, jid = parts[i - 1] if i else None, parts[i + 1] if len(parts) > i + 1 else None
    else:   # embed links: ...?for=board&token=id
        board, jid = q.get("for"), q.get("token") or q.get("gh_jid")
    if not (board and jid and jid.isdigit()):
        return None
    d = _get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{jid}")
    return html_blocks(d.get("content", ""))


def _lever(parts, q):
    if len(parts) < 2:
        return None
    d = _get(f"https://api.lever.co/v0/postings/{parts[0]}/{parts[1]}")
    blocks = html_blocks(d.get("description", "")) or text_blocks(d.get("descriptionPlain", ""))
    for lst in d.get("lists") or []:
        if lst.get("text"):
            blocks.append({"type": "h", "text": lst["text"]})
        blocks += html_blocks(lst.get("content", ""))
    blocks += html_blocks(d.get("additional", ""))
    return _trim(blocks)


_ashby_boards: dict[str, tuple[float, dict]] = {}


def _ashby(parts, q):
    if len(parts) < 2:
        return None
    org, jid = parts[0], parts[1]
    hit = _ashby_boards.get(org)
    if not hit or time.time() - hit[0] > TTL:
        d = _get(f"https://api.ashbyhq.com/posting-api/job-board/{org}")
        hit = (time.time(), {j.get("id"): j for j in d.get("jobs") or []})
        _ashby_boards[org] = hit
    j = hit[1].get(jid)
    if not j:
        return None
    return html_blocks(j.get("descriptionHtml", "")) or text_blocks(j.get("descriptionPlain", ""))


def _smartrecruiters(parts, q):
    if len(parts) < 2:
        return None
    m = re.match(r"(\d+)", parts[1])
    if not m:
        return None
    d = _get(f"https://api.smartrecruiters.com/v1/companies/{parts[0]}/postings/{m.group(1)}")
    sections = (d.get("jobAd") or {}).get("sections") or {}
    blocks = []
    for key in ("jobDescription", "qualifications", "additionalInformation", "companyDescription"):
        sec = sections.get(key) or {}
        if sec.get("text"):
            if sec.get("title"):
                blocks.append({"type": "h", "text": sec["title"]})
            blocks += html_blocks(sec["text"])
    return _trim(blocks)


def _workday(host, parts, q):
    # {tenant}.wd5.myworkdayjobs.com/[en-US/]{site}/job/{location}/{slug}
    if "job" not in parts:
        return None
    i = parts.index("job")
    site_parts = [p for p in parts[:i] if not re.fullmatch(r"[a-z]{2}-[A-Z]{2}", p)]
    if not site_parts:
        return None
    tenant, site, rest = host.split(".")[0], site_parts[-1], "/".join(parts[i + 1:])
    d = _get(f"https://{host}/wday/cxs/{tenant}/{site}/job/{rest}")
    return html_blocks((d.get("jobPostingInfo") or {}).get("jobDescription", ""))


def _workable(parts, q):
    # apply.workable.com/{account}/j/{shortcode}
    if "j" not in parts:
        return None
    i = parts.index("j")
    if i == 0 or len(parts) <= i + 1:
        return None
    d = _get(f"https://apply.workable.com/api/v2/accounts/{parts[i - 1]}/jobs/{parts[i + 1]}")
    blocks = html_blocks(d.get("description", ""))
    for key, title in (("requirements", "Requirements"), ("benefits", "Benefits")):
        if d.get(key):
            blocks.append({"type": "h", "text": title})
            blocks += html_blocks(d[key])
    return _trim(blocks)


def provider(url: str):
    """(name, fetcher) for a posting URL, or (None, None) when we can't read that site."""
    u = urlparse(url or "")
    host = (u.hostname or "").lower()
    parts = [p for p in u.path.split("/") if p]
    q = dict(x.split("=", 1) for x in u.query.split("&") if "=" in x)
    if host.endswith("greenhouse.io"):
        return "Greenhouse", lambda: _greenhouse(parts, q)
    if host == "jobs.lever.co":
        return "Lever", lambda: _lever(parts, q)
    if host == "jobs.ashbyhq.com":
        return "Ashby", lambda: _ashby(parts, q)
    if host in ("jobs.smartrecruiters.com", "careers.smartrecruiters.com"):
        return "SmartRecruiters", lambda: _smartrecruiters(parts, q)
    if host.endswith("myworkdayjobs.com"):
        return "Workday", lambda: _workday(host, parts, q)
    if host == "apply.workable.com":
        return "Workable", lambda: _workable(parts, q)
    return None, None


def description(url: str) -> dict | None:
    """{"blocks": [...], "from": "Greenhouse"} or None if it can't be read here."""
    name, fetch = provider(url)
    if not fetch:
        return None
    with _lock:
        hit = _cache.get(url)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    try:
        blocks = fetch()
        out = {"blocks": blocks, "from": name} if blocks else None
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:
        log.info("description unavailable for %s: %s", url, e)
        out = None
    with _lock:
        if len(_cache) > 2000:
            _cache.clear()
        _cache[url] = (time.time(), out)
    return out
