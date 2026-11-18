"""The AI layer: an LLM (Groq by default, any OpenAI-compatible API works) that answers questions
by calling two tools over the live listings: search_internships and count_internships."""
from __future__ import annotations

import json
import logging
import os
from datetime import date

import httpx

from fit import profile_summary
from search import aggregate, search

log = logging.getLogger("llm")
BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
API_KEY = os.getenv("LLM_API_KEY") or os.getenv("GROQ_API_KEY")
MODEL = os.getenv("LLM_MODEL", "openai/gpt-oss-120b")
MAX_STEPS = 5

PROFILE = os.getenv("USER_PROFILE", (
    "Raghav Venkat, 2nd-year CS undergrad at RV College of Engineering, Bangalore (graduates 2029). "
    "Skills: Python, Java, C, JavaScript, FastAPI, PostgreSQL, React, PyTorch, XGBoost, YOLO, LLMs/RAG. "
    "Interests: AI/ML, backend, full stack, software engineering (not frontend-only). "
    "Availability: remote Jan-Jun 2027, or onsite/hybrid Jun-Sep 2027. Prefers Austin, Dallas, Houston, "
    "the Bay Area, and Bangalore. Legally authorised to work in the US and willing to relocate, so roles "
    "without visa sponsorship are fine."))

FILTER_PROPS = {
    "keywords": {"type": "array", "items": {"type": "string"},
                 "description": "ALL must appear in the title/company (e.g. ['backend'])."},
    "any_keywords": {"type": "array", "items": {"type": "string"},
                     "description": "At least one must appear in title/company. Use for role families, e.g. "
                                    "['machine learning','ml','ai','deep learning'] or ['backend','back-end',"
                                    "'software engineer','sde','swe']."},
    "exclude_keywords": {"type": "array", "items": {"type": "string"},
                         "description": "Drop titles containing any of these, e.g. ['frontend','phd','hardware']."},
    "companies": {"type": "array", "items": {"type": "string"}, "description": "Company name contains."},
    "exclude_companies": {"type": "array", "items": {"type": "string"}},
    "locations": {"type": "array", "items": {"type": "string"},
                  "description": "Cities, metros, states or countries; a listing matches ANY. Understands "
                                 "'bay area', 'dallas' (DFW metro), 'texas', 'TX', 'us', 'india', 'bangalore', "
                                 "'nyc', 'seattle', 'remote', etc."},
    "remote": {"type": "string", "enum": ["only", "exclude", "any"]},
    "start_month": {"type": "string", "description": "YYYY-MM. Internship must overlap [start_month, end_month]."},
    "end_month": {"type": "string", "description": "YYYY-MM."},
    "terms": {"type": "array", "items": {"type": "string"},
              "description": "Exact terms like 'Summer 2027', 'Spring 2027', 'Fall 2027', 'Winter 2027'."},
    "include_undated": {"type": "boolean",
                        "description": "Keep listings that don't state dates (default true)."},
    "posted_within_days": {"type": "integer"},
    "categories": {"type": "array", "items": {"type": "string",
                   "enum": ["Software", "AI/ML/Data", "Hardware", "Product", "Quant"]}},
    "needs_sponsorship": {"type": "boolean", "description": "Only roles that don't rule out visa sponsorship."},
    "exclude_citizenship_required": {"type": "boolean"},
    "undergrad_only": {"type": "boolean", "description": "Drop Master's/PhD/MBA-only roles."},
    "fit_only": {"type": "boolean", "description": "Only roles that are a strong fit for the user's profile."},
}
TOOLS = [
    {"type": "function", "function": {
        "name": "search_internships",
        "description": "Search the live internship listings. Returns the total count and the top results.",
        "parameters": {"type": "object", "properties": {
            **FILTER_PROPS,
            "sort": {"type": "string", "enum": ["relevance", "newest", "fit"],
                     "description": "'fit' = best match for the user's profile."},
            "limit": {"type": "integer", "description": "1-50, default 15."},
        }}}},
    {"type": "function", "function": {
        "name": "count_internships",
        "description": "Count listings grouped by company, city, country, category or term (e.g. 'which "
                       "companies hire most in Dallas', 'how many remote roles').",
        "parameters": {"type": "object", "properties": {
            **FILTER_PROPS,
            "group_by": {"type": "string", "enum": ["company", "city", "country", "category", "term"]},
            "top": {"type": "integer"},
        }, "required": ["group_by"]}}},
]
ALLOWED = set(FILTER_PROPS) | {"sort", "limit", "group_by", "top"}


def system_prompt(meta, profile=None):
    about = profile_summary(profile) or PROFILE
    return f"""You are Internship Copilot, an assistant that helps a student find internships.
Today is {date.today():%A %d %B %Y}. You have {meta['count']} live listings (refreshed every 15 minutes; last
update {meta['updated_human']}). Most are US internships from the SimplifyJobs feed, plus some Indian ones
from Internshala and company career pages.

The user: {about}

Rules:
- For ANY question about jobs/internships, call a tool. Never invent listings, companies, links or counts.
- Translate the request into filters. Expand role words into synonyms with any_keywords (e.g. "ML" ->
  machine learning, ml, ai, deep learning, data scien). Map dates to start_month/end_month
  (e.g. "June to September" -> 2027-06 .. 2027-09; Summer ~ May-Aug, Spring ~ Jan-May, Winter ~ Jan-Apr,
  Fall ~ Sep-Dec). Use the user's profile only when they say "me", "for me", "my", "fit", or ask for
  recommendations; otherwise search exactly what they asked.
- If a search returns 0 or very few results, relax one filter (e.g. include undated, widen the location to the
  metro/state, add synonyms) and search again before answering, and say what you relaxed.
- The app shows the result cards (with links) from your LAST search under your message. So keep your reply short:
  2-5 sentences or a few bullets. Say how many matched, highlight the most interesting 2-4 by company and title,
  and mention notable patterns (dates, locations, sponsorship). Don't paste URLs or long lists.
- Mention caveats briefly and based on the user's situation: visa sponsorship ("Does Not Offer Sponsorship",
  "U.S. Citizenship is Required") against their work authorisation, and Master's/PhD-only roles.
- For non-job questions (resume tips, interview prep, what a role involves), answer helpfully without tools.
"""


def run_tool(name, args, jobs, profile=None):
    args = {k: v for k, v in (args or {}).items() if k in ALLOWED and v not in (None, "", [])}
    if args.get("remote") == "any":
        args.pop("remote")
    extra = {"profile": profile} if profile else {}
    if name == "count_internships":
        return aggregate(jobs, **args, **extra), args
    args.setdefault("limit", 15)
    return search(jobs, **args, **extra), args


def chat(messages, jobs, meta, profile=None):
    """messages: [{role: user|assistant, content: str}] from the client. Returns reply + last results."""
    if not API_KEY:
        raise RuntimeError("LLM_API_KEY (or GROQ_API_KEY) is not set on the server.")
    convo = [{"role": "system", "content": system_prompt(meta, profile)}]
    for m in messages[-20:]:
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str):
            convo.append({"role": m["role"], "content": m["content"][:4000]})
    steps, last = [], None
    for _ in range(MAX_STEPS):
        r = httpx.post(f"{BASE_URL}/chat/completions", timeout=60,
                       headers={"Authorization": f"Bearer {API_KEY}"},
                       json={"model": MODEL, "messages": convo, "tools": TOOLS, "tool_choice": "auto",
                             "temperature": 0.2})
        if r.status_code >= 300:
            raise RuntimeError(f"LLM error {r.status_code}: {r.text[:300]}")
        msg = r.json()["choices"][0]["message"]
        calls = msg.get("tool_calls") or []
        if not calls:
            return {"reply": (msg.get("content") or "").strip(), "steps": steps, "last": last}
        convo.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
        for c in calls:
            fn = c["function"]["name"]
            try:
                args = json.loads(c["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            try:
                result, used = run_tool(fn, args, jobs, profile)
            except Exception as e:
                result, used = {"error": str(e)}, args
            steps.append({"tool": fn, "args": used, "total": result.get("total")})
            if fn == "search_internships" and "results" in result:
                last = {"tool": fn, "args": used, **result}
            elif fn == "count_internships" and "counts" in result and last is None:
                last = {"tool": fn, "args": used, **result}
            # send the model a trimmed copy (keeps tokens low)
            slim = dict(result)
            if "results" in slim:
                slim["results"] = [{k: v for k, v in x.items() if k in
                                    ("title", "company", "locations", "terms", "posted", "remote", "sponsorship",
                                     "fit", "stipend")} for x in slim["results"]]
            convo.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(slim)[:12000]})
    return {"reply": "I ran several searches; here are the latest results.", "steps": steps, "last": last}
