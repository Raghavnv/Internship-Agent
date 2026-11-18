"""Resume helpers: PDF text extraction, AI profile extraction and AI review against a job."""
from __future__ import annotations

import io
import json
import re

import httpx

import llm


def pdf_text(data: bytes, limit=20000) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join((page.extract_text() or "") for page in reader.pages[:6])
    return re.sub(r"[ \t]+", " ", text).strip()[:limit]


def _complete(messages, json_mode=False, max_tokens=1400):
    if not llm.API_KEY:
        raise RuntimeError("LLM_API_KEY (or GROQ_API_KEY) is not set on the server.")
    body = {"model": llm.MODEL, "messages": messages, "temperature": 0.2, "max_tokens": max_tokens}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    r = httpx.post(f"{llm.BASE_URL}/chat/completions", json=body, timeout=90,
                   headers={"Authorization": f"Bearer {llm.API_KEY}"})
    if r.status_code >= 300:
        raise RuntimeError(f"LLM error {r.status_code}: {r.text[:200]}")
    return r.json()["choices"][0]["message"].get("content") or ""


EXTRACT_PROMPT = """You read a student's resume and turn it into a structured profile. Reply with JSON only, exactly this shape:
{
 "full_name": str|null, "email": str|null, "phone": str|null, "based_in": str|null,
 "headline": str|null, "bio": str|null,
 "linkedin": str|null, "github": str|null, "portfolio": str|null, "other_links": [{"label": str, "url": str}],
 "education": [{"school": str, "degree": str|null, "field": str|null, "start": "YYYY-MM"|null, "end": "YYYY-MM"|null, "grade": str|null}],
 "experience": [{"company": str, "title": str, "location": str|null, "start": "YYYY-MM"|null, "end": "YYYY-MM"|null, "current": bool, "bullets": [str]}],
 "projects": [{"title": str, "description": str, "url": str|null, "tech": [str]}],
 "skills": [str], "roles": [str],
 "certifications": [{"name": str, "issuer": str|null, "year": int|null}],
 "achievements": [{"title": str, "detail": str|null, "year": int|null}],
 "spoken_languages": [str]
}
Rules:
- Copy facts from the resume only. Never invent anything. Use null or [] when something isn't there.
- based_in: the city/country the person lives in, e.g. "Bengaluru, India".
- headline: one short line in their voice, e.g. "CS student building AI-powered full-stack apps".
- bio: 2-3 sentences summarising who they are and what they've built, written in first person.
- education: newest first. degree like "B.E." or "B.Tech", field like "Computer Science". Include school (high school) too.
- experience: newest first, up to 3 bullets each, rewritten tightly but keeping their facts. current=true if ongoing.
- projects: each with a one or two sentence description and the technologies used.
- skills: up to 25 concrete technical skills with short standard names ("Python", "React", "PostgreSQL").
- roles: up to 4 that fit best, exact spelling from: Software Engineering, Backend, Full Stack, Frontend, AI / ML,
  Data Science, Data Engineering, Mobile, DevOps / Cloud, Security, Research, Product, Quant, Hardware / Embedded,
  Design / UX, Forward Deployed.
- Dates as "YYYY-MM" (use "-01" if only the year is known). URLs as full https:// links."""

ROLE_SET = {"Software Engineering", "Backend", "Full Stack", "Frontend", "AI / ML", "Data Science", "Data Engineering",
            "Mobile", "DevOps / Cloud", "Security", "Research", "Product", "Quant", "Hardware / Embedded", "Design / UX",
            "Forward Deployed"}


def _s(v, n=200):
    if v is None:
        return None
    v = re.sub(r"\s+", " ", str(v)).strip()
    return v[:n] or None


def _url(v):
    v = _s(v, 300)
    if not v:
        return None
    if not re.match(r"^https?://", v, re.I):
        v = "https://" + v.lstrip("/")
    return v if re.match(r"^https?://[^\s/$.?#].[^\s]*$", v, re.I) else None


def _ym(v):
    v = _s(v, 20)
    if not v:
        return None
    m = re.match(r"(\d{4})(?:-(\d{1,2}))?", v)
    if not m:
        return None
    return f"{m.group(1)}-{int(m.group(2) or 1):02d}"


def _year(v):
    try:
        y = int(str(v)[:4])
        return y if 1990 <= y <= 2040 else None
    except (TypeError, ValueError):
        return None


def _list(v, n):
    return [x for x in (v if isinstance(v, list) else [])][:n]


def clean_profile(d: dict) -> dict:
    """Validates and normalises the LLM's JSON so only well-formed data reaches the database."""
    out = {}
    for k, n in (("full_name", 80), ("email", 120), ("phone", 40), ("based_in", 80), ("headline", 140), ("bio", 700)):
        if _s(d.get(k), n):
            out[k] = _s(d.get(k), n)
    for k in ("linkedin", "github", "portfolio"):
        if _url(d.get(k)):
            out[k] = _url(d.get(k))
    links = [{"label": _s(x.get("label"), 40) or "Link", "url": _url(x.get("url"))}
             for x in _list(d.get("other_links"), 6) if isinstance(x, dict)]
    if links := [l for l in links if l["url"]]:
        out["other_links"] = links
    edu = [{"school": _s(x.get("school"), 120), "degree": _s(x.get("degree"), 60), "field": _s(x.get("field"), 80),
            "start": _ym(x.get("start")), "end": _ym(x.get("end")), "grade": _s(x.get("grade"), 30)}
           for x in _list(d.get("education"), 5) if isinstance(x, dict) and _s(x.get("school"))]
    if edu:
        out["education"] = edu
    exp = [{"company": _s(x.get("company"), 100), "title": _s(x.get("title"), 100), "location": _s(x.get("location"), 80),
            "start": _ym(x.get("start")), "end": _ym(x.get("end")), "current": bool(x.get("current")),
            "bullets": [b for b in (_s(b, 240) for b in _list(x.get("bullets"), 4)) if b]}
           for x in _list(d.get("experience"), 8) if isinstance(x, dict) and _s(x.get("company")) and _s(x.get("title"))]
    if exp:
        out["experience"] = exp
    proj = [{"title": _s(x.get("title"), 100), "description": _s(x.get("description"), 400) or "",
             "url": _url(x.get("url")), "tech": [t for t in (_s(t, 30) for t in _list(x.get("tech"), 10)) if t]}
            for x in _list(d.get("projects"), 8) if isinstance(x, dict) and _s(x.get("title"))]
    if proj:
        out["projects"] = proj
    skills, seen = [], set()
    for sk in _list(d.get("skills"), 40):
        sk = _s(sk, 40)
        if sk and sk.lower() not in seen:
            seen.add(sk.lower())
            skills.append(sk)
    if skills:
        out["skills"] = skills[:25]
    roles = [r for r in _list(d.get("roles"), 6) if r in ROLE_SET]
    if roles:
        out["roles"] = roles[:4]
    certs = [{"name": _s(x.get("name"), 120), "issuer": _s(x.get("issuer"), 80), "year": _year(x.get("year"))}
             for x in _list(d.get("certifications"), 10) if isinstance(x, dict) and _s(x.get("name"))]
    if certs:
        out["certifications"] = certs
    ach = [{"title": _s(x.get("title"), 140), "detail": _s(x.get("detail"), 240), "year": _year(x.get("year"))}
           for x in _list(d.get("achievements"), 10) if isinstance(x, dict) and _s(x.get("title"))]
    if ach:
        out["achievements"] = ach
    langs = [l for l in (_s(x, 30) for x in _list(d.get("spoken_languages"), 8)) if l]
    if langs:
        out["spoken_languages"] = langs
    # summary fields the matcher uses: taken directly if given, else from the newest degree
    for k, n in (("college", 120), ("degree", 60), ("major", 80)):
        if _s(d.get(k), n):
            out[k] = _s(d.get(k), n)
    if _year(d.get("grad_year")):
        out["grad_year"] = _year(d.get("grad_year"))
    deg = next((e for e in edu if e.get("degree")), None)
    if deg and not out.get("college"):
        out["college"], out["degree"], out["major"] = deg["school"], deg["degree"], deg.get("field")
        if deg.get("end"):
            out["grad_year"] = int(deg["end"][:4])
        lvl = (deg["degree"] or "").lower()
        out["degree_level"] = ("phd" if re.search(r"ph\.?d|doctor", lvl) else "masters" if re.search(r"\bm\.?(s|sc|tech|e|eng)\b|master|mba", lvl)
                               else "bachelors")
    return out


def extract_profile(text: str) -> dict:
    out = _complete([{"role": "system", "content": EXTRACT_PROMPT},
                     {"role": "user", "content": text[:14000]}], json_mode=True, max_tokens=3000)
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", out, re.S)
        data = json.loads(m.group(0)) if m else {}
    return clean_profile(data if isinstance(data, dict) else {})


REVIEW_PROMPT = """You are a sharp, kind internship coach. Compare the student's resume with the job and reply in
Markdown with these sections, keeping the whole answer under 300 words:
**Match**: one sentence with an honest 0-100 match estimate.
**Strengths**: 2-4 bullets of what already fits, quoting their real experience.
**Gaps**: 2-4 bullets of missing skills or evidence the job asks for.
**Rewrite these bullets**: 2-3 improved resume bullets they could use, based only on what's in their resume
(never invent experience; mark anything they'd need to fill in with [brackets]).
**Before applying**: 1-2 concrete actions."""


def review(text: str, job: dict) -> str:
    jd = f"Role: {job.get('title')}\nCompany: {job.get('company')}\nLocation: {', '.join(job.get('locations') or [])}\n" \
         f"Dates: {', '.join(job.get('terms') or []) or 'not stated'}\nNotes: {job.get('notes') or ''}"
    return _complete([{"role": "system", "content": REVIEW_PROMPT},
                      {"role": "user", "content": f"RESUME:\n{text[:10000]}\n\nJOB:\n{jd}"}])
