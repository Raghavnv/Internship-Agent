"""Filtering and ranking against Raghav's profile."""
from __future__ import annotations

import re
import time

US_STATES = ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ "
             "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC").split()
US_RE = re.compile(r"(,\s*(" + "|".join(US_STATES) + r")\b)|\b(usa|united states|u\.s\.|us|nyc|sf)\b", re.I)
INDIA_RE = re.compile(r"\b(india|bangalore|bengaluru|hyderabad|pune|mumbai|delhi|gurgaon|gurugram|noida|"
                      r"chennai|kolkata|ahmedabad|jaipur|kochi|chandigarh|mysore|mysuru)\b", re.I)
REMOTE_RE = re.compile(r"\b(remote|work from home|wfh|anywhere)\b", re.I)
NON_US_HINT = re.compile(r"\b(canada|uk|united kingdom|london|germany|france|ireland|singapore|japan|china|"
                         r"australia|netherlands|spain|poland|israel|mexico|brazil|ontario|toronto|vancouver|"
                         r"on, canada|bc, canada|ab, canada|qc)\b", re.I)
STRONG_ROLE = ["software engineer*", "software develop*", "swe", "sde", "backend", "back-end", "back end",
               "full stack", "full-stack", "fullstack", "machine learning", "ml", "ai", "llm", "genai",
               "deep learning", "computer vision", "nlp", "forward deploy*", "applied scien*",
               "research engineer", "ai engineer", "data scien*"]
WEAK_ROLE = ["quality", "data analyst", "analytics", "business intelligence", "qa", "test", "quality assurance",
             "it support", "help desk", "technical support"]
GOOD_CATEGORIES = {"Software", "AI/ML/Data", "Software Engineering", "Data Science, AI & Machine Learning"}


def kw_regex(words):
    parts = []
    for w in words:
        w = w.strip().lower()
        if not w:
            continue
        if w.endswith("*"):
            parts.append(r"(?<![a-z0-9])" + re.escape(w[:-1]))
        else:
            parts.append(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])")
    return re.compile("|".join(parts), re.I) if parts else re.compile(r"(?!x)x")


class Matcher:
    def __init__(self, cfg):
        self.cfg = cfg
        r = cfg["roles"]
        self.inc = kw_regex(r["include_keywords"])
        self.exc = kw_regex(r["exclude_keywords"])
        self.fe_ok = kw_regex(r.get("frontend_ok_if", []))
        self.fe = kw_regex(["frontend", "front-end", "front end", "ui developer"])
        self.strong = kw_regex(STRONG_ROLE)
        self.weak = kw_regex(WEAK_ROLE)
        self.pref = kw_regex(cfg["locations"]["preferred"])
        self.skills = [s.lower() for s in cfg["profile"]["skills"]]
        self.skill_re = {s: kw_regex([s]) for s in self.skills}
        self.scam = kw_regex(cfg.get("scam_filters", []))
        self.top = kw_regex(cfg.get("top_companies", []))
        w = cfg["windows"]
        self.onsite_terms = set(w["onsite_terms"])
        self.remote_terms = set(w["remote_terms"])
        self.undated_max = w.get("undated_max_age_days", 45) * 86400

    # ── role ──
    def role_ok(self, job):
        t = job["title"]
        if not t:
            return False
        if self.exc.search(t):
            if not (self.fe.search(t) and self.fe_ok.search(t)):
                return False
        if job.get("category") and job["category"] not in GOOD_CATEGORIES:
            return False
        return bool(self.inc.search(t))

    # ── location ──
    def classify_location(self, job):
        """Returns (bucket, matched_location). Buckets: preferred, remote, other_us, other_india, None."""
        locs = job["locations"] or []
        best = (None, None)
        rank = {"preferred": 4, "remote": 3, "other_us": 2, "other_india": 1}
        for l in locs:
            b = None
            if self.pref.search(l):
                b = "preferred"
            elif REMOTE_RE.search(l):
                # "Remote in Canada" etc. doesn't count
                b = None if NON_US_HINT.search(l) else "remote"
            elif INDIA_RE.search(l):
                b = "other_india"
            elif US_RE.search(l) and not NON_US_HINT.search(l):
                b = "other_us"
            if b and (best[0] is None or rank[b] > rank[best[0]]):
                best = (b, l)
        if best[0] is None and job.get("remote") and not any(NON_US_HINT.search(l) for l in locs):
            best = ("remote", "Remote")
        return best

    # ── timing ──
    def term_ok(self, job, bucket):
        terms = set(job.get("terms") or [])
        if terms:
            allowed = self.remote_terms if bucket == "remote" else self.onsite_terms
            return bool(terms & allowed), True
        posted = job.get("posted")
        if posted and time.time() - posted > self.undated_max:
            return False, False
        return True, False

    def evaluate(self, job):
        """Returns None if rejected, else dict(score, bucket, loc, reasons, tags)."""
        if not self.role_ok(job):
            return None
        degrees = job.get("degrees") or []
        if degrees and not ({"Bachelor's", "Associate's"} & set(degrees)):
            return None  # Master's / PhD / MBA only
        text = (job["title"] + " " + job.get("company", "") + " " + job.get("raw_text", "")).lower()
        if self.scam.search(text):
            return None
        bucket, loc = self.classify_location(job)
        if bucket is None:
            return None
        lc = self.cfg["locations"]
        if bucket == "remote" and not lc.get("include_remote", True):
            return None
        if bucket == "other_us" and not lc.get("other_us_in_digest", True):
            return None
        if bucket == "other_india" and not lc.get("other_india_in_digest", True):
            return None
        ok, term_known = self.term_ok(job, bucket)
        if not ok:
            return None
        spons = (job.get("sponsorship") or "")
        if "Citizenship" in spons and self.cfg["us_work_authorization"].get("drop_citizenship_required"):
            return None

        score, reasons, tags = 20, [], []
        t = job["title"]
        if self.strong.search(t):
            score += 15
        if self.weak.search(t):
            score -= 12
        hits = [s for s, rx in self.skill_re.items() if rx.search(text)]
        score += min(8, 4 * len(hits))
        if hits:
            reasons.append("matches your " + ", ".join(hits[:3]))
        if self.top.search(job.get("company", "")):
            score += 12
            reasons.insert(0, "well-known company")
        score += {"preferred": 22, "remote": 18, "other_us": 4, "other_india": 4}[bucket]
        terms = set(job.get("terms") or [])
        score += 10                       # unstated dates count the same as stated ones: they don't lower the match
        if term_known:
            if bucket != "remote" and terms & {"Fall 2027", "Winter 2028"}:
                tags.append("co-op may run past September")
                score -= 5
        else:
            tags.append("dates not stated - check")
        posted = job.get("posted")
        if posted:
            age = (time.time() - posted) / 86400
            score += 8 if age <= 3 else 4 if age <= 14 else 0
        if job["source"] != "Internshala":
            score += 5  # curated / direct company boards
        if "Does Not Offer" in spons:
            tags.append("no visa sponsorship (fine for you)")
        if "Citizenship" in spons:
            tags.append("US citizenship required")
        return {"score": max(0, min(100, score)), "bucket": bucket, "loc": loc,
                "reasons": reasons, "tags": tags, "term_known": term_known}

    def is_instant(self, job, ev):
        if ev["bucket"] not in ("preferred", "remote"):
            return False
        if ev["score"] < self.cfg["alerts"]["instant_min_score"]:
            return False
        if job["source"] == "Internshala":
            # Internshala is noisy: only instantly alert on decent stipends
            return stipend_inr(job.get("stipend")) >= 10000
        return True


def stipend_inr(s):
    if not s:
        return 0
    nums = [int(n.replace(",", "")) for n in re.findall(r"\d[\d,]*", s)]
    if not nums:
        return 0
    v = max(nums)
    if "week" in s.lower():
        v *= 4
    if "lump" in s.lower():
        v //= 3
    return v
