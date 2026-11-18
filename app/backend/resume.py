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


EXTRACT_PROMPT = """Extract a student's profile from their resume. Reply with JSON only, using exactly these keys:
{"full_name": str|null, "college": str|null, "degree": str|null, "major": str|null, "grad_year": int|null,
 "skills": [str], "roles": [str], "linkedin": str|null, "github": str|null, "portfolio": str|null, "headline": str|null}
- skills: up to 20 concrete technical skills (languages, frameworks, tools), short names like "Python", "React".
- roles: which of these fit the experience best (choose up to 4, exact spelling): Software Engineering, Backend,
  Full Stack, Frontend, AI / ML, Data Science, Data Engineering, Mobile, DevOps / Cloud, Security, Research,
  Product, Quant, Hardware / Embedded, Design / UX, Forward Deployed.
- headline: one short line describing them, e.g. "CS student building AI-powered full-stack apps".
- Use null when something isn't in the resume. Never invent facts."""


def extract_profile(text: str) -> dict:
    out = _complete([{"role": "system", "content": EXTRACT_PROMPT},
                     {"role": "user", "content": text[:12000]}], json_mode=True, max_tokens=900)
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", out, re.S)
        data = json.loads(m.group(0)) if m else {}
    keep = {"full_name", "college", "degree", "major", "grad_year", "skills", "roles", "linkedin", "github",
            "portfolio", "headline"}
    data = {k: v for k, v in data.items() if k in keep and v not in (None, "", [])}
    if "skills" in data:
        data["skills"] = [str(s)[:40] for s in data["skills"]][:20]
    if "grad_year" in data:
        try:
            data["grad_year"] = int(data["grad_year"])
        except (TypeError, ValueError):
            data.pop("grad_year")
    return data


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
