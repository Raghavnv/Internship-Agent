"""Application helpers: tailor a resume to one listing, and draft a referral request.

Keyword matching is deterministic (a fixed vocabulary scanned in the description and the profile), so
it works without the LLM and can't invent skills. The LLM only rewrites bullets the person already
has and drafts messages; it is told never to add experience, numbers or tools that aren't there.
"""
from __future__ import annotations

import json
import re

import resume as resume_ai

VOCAB = [
    # languages
    "Python", "Java", "C++", "C#", "C", "Go", "Rust", "JavaScript", "TypeScript", "Kotlin", "Swift", "Scala", "Ruby", "PHP",
    "SQL", "R", "MATLAB", "Bash", "Dart", "Solidity",
    # web / backend
    "React", "Next.js", "Angular", "Vue", "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring", "Spring Boot",
    ".NET", "GraphQL", "REST", "gRPC", "Microservices", "HTML", "CSS", "Tailwind", "Redux",
    # data / infra
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Cassandra", "DynamoDB", "Elasticsearch", "Kafka", "RabbitMQ", "Spark",
    "Hadoop", "Airflow", "Snowflake", "BigQuery", "dbt", "ETL", "Data pipelines",
    "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "CI/CD", "Jenkins", "GitHub Actions", "Linux", "Git",
    "Serverless", "Vercel", "Render", "Supabase", "Firebase",
    # AI / ML
    "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", "Keras", "scikit-learn", "XGBoost", "Pandas", "NumPy",
    "Computer Vision", "NLP", "LLM", "LLMs", "RAG", "Transformers", "Hugging Face", "LangChain", "OpenAI", "Prompt engineering",
    "Vector database", "ChromaDB", "Pinecone", "YOLO", "OpenCV", "Reinforcement learning", "MLOps", "Statistics",
    "Data analysis", "A/B testing", "Recommendation systems", "Generative AI", "Fine-tuning",
    # mobile / other
    "Android", "iOS", "React Native", "Flutter", "Embedded", "IoT", "Firmware", "Verilog", "FPGA", "Robotics", "ROS",
    "Unity", "Three.js", "WebGL", "Figma",
    # practice
    "System design", "Distributed systems", "Data structures", "Algorithms", "Object-oriented", "Unit testing", "Testing",
    "Agile", "Scrum", "API design", "Security", "Networking", "Operating systems", "Cloud", "Backend", "Frontend", "Full stack",
    "Customer-facing", "Communication", "Leadership",
]
ALIASES = {"LLMs": "LLM", "Postgres": "PostgreSQL", "K8s": "Kubernetes", "Golang": "Go", "sklearn": "scikit-learn",
           "ML": "Machine Learning", "AI": "Machine Learning", "JS": "JavaScript", "TS": "TypeScript", "Node": "Node.js",
           "Spring Boot": "Spring Boot"}


def _rx(term):
    t = re.escape(term)
    if len(term) <= 2 or term in ("Go", "R", "C", "Rust", "Spring", "Express", "Testing", "Cloud", "Security"):
        return re.compile(rf"(?<![\w+#.]){t}(?![\w+#])")          # case-sensitive for short/ambiguous words
    return re.compile(rf"(?<![\w+#.]){t}(?![\w+#])", re.I)


# a bare "C" is everywhere in prose ("Grade C", "C-suite"), so only count it in language-like phrases
_C_RX = re.compile(r"(?<![\w+#])C(?=\s*(?:/|,|and|or)\s*C\+\+)|\bC (?:programming|language)\b|\b(?:in|using|with) C\b(?![+#])|\b(?:Java|Python|C\+\+|Go|Rust)\s*(?:,|/|and|or)\s*C\b(?![+#])")
_RX = [(t, _C_RX if t == "C" else _rx(t)) for t in VOCAB] + [(canon, _rx(a)) for a, canon in ALIASES.items() if a not in VOCAB]


def terms_in(text: str) -> list[str]:
    seen, out = set(), []
    for canon, rx in _RX:
        c = ALIASES.get(canon, canon)
        if c not in seen and rx.search(text or ""):
            seen.add(c)
            out.append(c)
    return out


def profile_text(p: dict, projects: list | None = None) -> str:
    parts = [p.get("headline") or "", p.get("bio") or "", " ".join(p.get("skills") or []), p.get("resume_text") or ""]
    for e in p.get("experience") or []:
        parts += [e.get("title") or "", e.get("company") or "", " ".join(e.get("bullets") or [])]
    for pr in projects or []:
        parts += [pr.get("title") or "", pr.get("description") or "", " ".join(pr.get("tech") or [])]
    return "\n".join(parts)


def _bullets(p: dict, projects: list | None):
    out = []
    for e in p.get("experience") or []:
        for b in (e.get("bullets") or [])[:6]:
            out.append({"source": f"{e.get('title') or 'Role'}, {e.get('company') or ''}".strip(", "), "text": b})
    for pr in projects or []:
        if pr.get("description"):
            out.append({"source": f"Project: {pr.get('title')}", "text": pr["description"][:400]})
    return out[:14]


TAILOR_PROMPT = """You help a student tailor their resume to one internship listing.
You get the listing (title, company, description) and the student's real resume bullets, each with an id.
Reply with JSON only:
{"summary": str, "bullets": [{"id": int, "rewritten": str, "why": str}], "advice": [str]}
Rules:
- summary: one resume summary line (max 30 words) aimed at this role, using only facts from the resume.
- bullets: pick the 3 to 5 bullets most relevant to this role and rewrite each to lead with impact and use the
  listing's wording where it is TRUE for the student. Keep each under 30 words.
- NEVER add tools, numbers, employers, results or responsibilities that are not in the original bullet.
  If a bullet has no metric, don't invent one. You may reorder words and swap in the listing's terms for the same thing.
- why: under 12 words, what about the listing this bullet now speaks to.
- advice: up to 3 short, concrete suggestions (e.g. "Add a project using Kafka if you have one").
Plain text inside strings; no markdown."""


def tailor(job: dict, description: str, p: dict, projects: list | None = None) -> dict:
    jd_terms = terms_in(f"{job.get('title', '')}\n{description}")
    mine = set(terms_in(profile_text(p, projects)))
    matched = [t for t in jd_terms if t in mine]
    missing = [t for t in jd_terms if t not in mine]
    bullets = _bullets(p, projects)
    out = {"matched": matched, "missing": missing, "summary": None, "bullets": [], "advice": [],
           "coverage": round(100 * len(matched) / len(jd_terms)) if jd_terms else None, "has_description": bool(description.strip())}
    if not bullets and not p.get("resume_text"):
        out["advice"] = ["Upload your resume or add experience to your profile so bullets can be tailored."]
        return out
    listing = f"Title: {job.get('title')}\nCompany: {job.get('company')}\nDescription:\n{(description or 'Not available; use the title.')[:7000]}"
    mine_txt = "\n".join(f"[{i}] ({b['source']}) {b['text']}" for i, b in enumerate(bullets))
    if not bullets:
        mine_txt = f"(No structured bullets. Resume text:)\n{(p.get('resume_text') or '')[:5000]}"
    try:
        raw = resume_ai._complete([{"role": "system", "content": TAILOR_PROMPT},
                                   {"role": "user", "content": f"LISTING\n{listing}\n\nRESUME BULLETS\n{mine_txt}"}],
                                  json_mode=True, max_tokens=1500)
        d = json.loads(raw)
    except (RuntimeError, ValueError, TypeError) as e:
        out["error"] = f"Couldn't rewrite bullets right now ({str(e)[:80]}). The keyword check above still works."
        return out
    out["summary"] = (d.get("summary") or "").strip()[:300] or None
    for b in (d.get("bullets") or [])[:6]:
        try:
            i = int(b.get("id"))
        except (TypeError, ValueError):
            continue
        if 0 <= i < len(bullets) and (b.get("rewritten") or "").strip():
            out["bullets"].append({"source": bullets[i]["source"], "original": bullets[i]["text"],
                                   "rewritten": b["rewritten"].strip()[:400], "why": (b.get("why") or "").strip()[:120]})
    out["advice"] = [str(a).strip()[:200] for a in (d.get("advice") or []) if str(a).strip()][:3]
    return out


REFERRAL_PROMPT = """Write a referral request a student will send on LinkedIn to someone at a company, ideally an alumnus of their college.
Reply with JSON only: {"note": str, "message": str}
- note: a connection-request note, at most 280 characters including spaces. Warm, specific, no flattery, ends with a clear ask.
- message: a follow-up message of 70 to 120 words: who they are (college, year), the exact role and why it fits them
  (one concrete thing from their background), a polite ask for a referral or a 10-minute chat, and thanks.
- Use "[Name]" where the recipient's first name goes. Use only facts given. No emojis, no markdown, no subject line."""


def referral(job: dict, p: dict, projects: list | None = None) -> dict:
    college = p.get("college") or "my college"
    me = (f"{p.get('full_name') or 'A student'}, {p.get('year_of_study') or ''} {p.get('degree') or ''} {p.get('major') or ''} "
          f"at {college}. Headline: {p.get('headline') or ''}. Skills: {', '.join((p.get('skills') or [])[:12])}.").replace("  ", " ")
    exp = "; ".join(f"{e.get('title')} at {e.get('company')}" for e in (p.get("experience") or [])[:2] if e.get("company"))
    proj = "; ".join(pr.get("title") for pr in (projects or [])[:3] if pr.get("title"))
    facts = f"{me}\nExperience: {exp or 'none listed'}\nProjects: {proj or 'none listed'}"
    role = f"{job.get('title')} at {job.get('company')}"
    try:
        raw = resume_ai._complete([{"role": "system", "content": REFERRAL_PROMPT},
                                   {"role": "user", "content": f"ROLE: {role}\nLINK: {job.get('url') or ''}\nSTUDENT:\n{facts}"}],
                                  json_mode=True, max_tokens=700)
        d = json.loads(raw)
        note, msg = (d.get("note") or "").strip(), (d.get("message") or "").strip()
        if not note or not msg:
            raise ValueError("empty draft")
    except (RuntimeError, ValueError, TypeError):
        first = (p.get("full_name") or "").split(" ")[0] or "I"
        note = (f"Hi [Name], I'm {first}, a student at {college}. I'm applying for the {job.get('title')} role at "
                f"{job.get('company')} and would value a quick word about your team. Would you be open to connecting?")
        msg = (f"Hi [Name], thanks for connecting. I'm {p.get('full_name') or first}, studying {p.get('major') or 'computer science'} at "
               f"{college}. I'm applying for the {role} and it lines up closely with what I've been building"
               f"{' (' + proj + ')' if proj else ''}. If you think I'd be a fit, would you be willing to refer me, or share "
               f"10 minutes on what the team looks for? Here's the listing: {job.get('url') or ''}. Thank you!")
    if len(note) > 300:
        note = note[:297].rsplit(" ", 1)[0] + "…"
    return {"note": note, "message": msg}
