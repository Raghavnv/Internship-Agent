# ✈️ Internship Copilot

Chat with every live internship your alert agent tracks (~5,000 roles, refreshed every 15 minutes).

> "Backend or full stack internships in Austin or Dallas for summer 2027"
> "Remote ML internships I could do between January and June"
> "Which companies have the most openings in Texas?"

Each answer comes with its matching roles underneath: company, city, dates, a fit-score ring and an Apply link.

## How it works

```
GitHub Actions (every 15 min)          FastAPI backend (Render)                 React frontend (Vercel)
agent/ fetches SimplifyJobs,   ──►    loads data branch jobs.json      ◄──►     chat + ticket board
Internshala, company boards           LLM (Groq gpt-oss-120b) calls
→ publishes jobs.json (data branch)   search_internships / count_internships
```

- **The AI never invents jobs.** The LLM turns your question into structured filters (roles + synonyms,
  cities/metros/states/countries, month ranges, remote, company, visa, degree, recency, fit) and calls a
  search tool over the real listings. The UI shows the tool's results directly and the filters it used as chips.
- **Search engine** (`backend/search.py`): in-memory filtering and ranking, ~15 ms over 5k listings.
  Understands metros ("bay area", "dallas" = DFW), states ("texas", "TX"), countries, and maps seasons
  (Winter/Spring/Summer/Fall YYYY) to months for date-range questions. De-duplicates reposted roles.
- **Frontend** (`frontend/`): React + Vite, no UI framework, self-hosted fonts, responsive, keyboard accessible.

## Run locally

```bash
# backend
cd app/backend
pip install -r requirements.txt
export GROQ_API_KEY=gsk_...        # free at console.groq.com
uvicorn main:app --reload           # http://localhost:8000/api/health

# frontend (new terminal)
cd app/frontend
npm install
npm run dev                         # http://localhost:5173 (proxies /api to :8000)
```

Tests: `cd app/backend && python -m pytest -q` (uses a fake LLM and `tests/sample_jobs.json`).

## Deploy (free)

**1. Backend on Render**
1. render.com → sign in with GitHub → **New → Blueprint** → pick `Internship-Agent`. It reads `render.yaml`.
2. Fill in the secrets it asks for:
   - `GROQ_API_KEY`: from console.groq.com → API Keys
   - `APP_PASSCODE`: any word you choose; the site will ask for it, so strangers can't use up your Groq quota
   - `ALLOWED_ORIGINS`: your Vercel URL from step 2 (you can leave it blank at first and fill it in after)
3. Deploy, then open `https://<your-service>.onrender.com/api/health`. You should see `"llm": true`.
   (Free Render services sleep after 15 min idle; the first request then takes ~30 s.)

**2. Frontend on Vercel**
1. vercel.com → sign in with GitHub → **Add New → Project** → import `Internship-Agent`.
2. **Root Directory:** `app/frontend` (framework preset: Vite).
3. **Environment variable:** `VITE_API_URL` = `https://<your-service>.onrender.com`
4. Deploy. Then put the Vercel URL into Render's `ALLOWED_ORIGINS`.

## Configuration (backend env vars)

| Variable | Default | What it does |
|---|---|---|
| `GROQ_API_KEY` / `LLM_API_KEY` | – | LLM key |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | Any OpenAI-compatible API works |
| `LLM_MODEL` | `openai/gpt-oss-120b` | Try `openai/gpt-oss-20b` for faster replies |
| `APP_PASSCODE` | none | Require a passcode to use the app |
| `ALLOWED_ORIGINS` | `*` | Comma-separated frontend URLs for CORS |
| `CHAT_RATE_PER_HOUR` | `60` | Questions per IP per hour |
| `DATA_URL` | this repo's `data` branch | Where listings are loaded from |
| `USER_PROFILE` | Raghav's profile | Used for "for me" / "best fit" questions |
