# ✈️ Internship Copilot

A full-stack AI app for finding internships. Students sign up, answer a few questions about themselves, and every
one of 5,000+ live listings (refreshed every 15 minutes) is scored for them. They can ask an AI in plain words,
explore on a live world map, track applications, save roles, and get resume feedback for any role.

**Stack:** React + Vite (frontend, Vercel) · FastAPI (backend, Render) · Supabase (Postgres, auth, file storage) ·
Groq `gpt-oss-120b` (LLM with tool calling) · GitHub Actions data pipeline (`../agent`).

## What's in it

| Area | What it does |
|---|---|
| **Landing** | Animated live map: a student somewhere asks a question, arcs draw to matching cities. How it works, features, live stats. |
| **Sign up / log in** | Email + password (Supabase Auth). |
| **Onboarding** | 6 short steps: about you, resume (auto-extracts skills), roles, where and when, eligibility (visa, pay), links. |
| **Overview** | Greeting, numbers, top matches, quick AI ask, application pipeline, profile strength checklist. |
| **AI Copilot** | Chat. The LLM turns questions into filters and calls `search_internships` / `count_internships` over real listings. Results land on the map. |
| **Explore** | Manual filters (cities, roles, keyword, remote, recency, sort, "strong fits only") with the map. |
| **Applications** | Tracker: Applied, Interviewing, Offer, Rejected; notes; follow-up nudges; CSV export. Clicking Apply anywhere adds a role here. |
| **Saved** | Bookmarked roles. |
| **Resume** | Private PDF upload (Supabase Storage), skill extraction, AI feedback and rewritten bullets for a chosen role. |
| **Profile** | Full profile: basics and contact, about, experience, education, projects, skills, certifications and achievements, languages and links, internship preferences. Each section edits in place. **Update from resume**: the AI reads a PDF and proposes changes you tick to apply. |
| **Portfolio** | Read-only showcase built from the profile, with **Download PDF** (print-styled). |

**Fit scores are per user** (`backend/fit.py`): role interests, skills, preferred locations, remote/in-person
availability windows vs. the internship's dates, degree level, US work authorisation vs. sponsorship, pay and recency.

**Privacy:** every table uses Postgres row-level security, so users can only ever read or change their own rows and
resume files (`supabase/schema.sql`).

---

## Setup

### 1. Supabase (database + login), about 10 minutes
1. Go to **supabase.com**, sign in with GitHub, and click **New project**. Name it `internship-copilot`, set a database password (save it somewhere), and choose the **Mumbai** region (closest to you).
2. When it's ready, open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. (Re-run it after updates: it's safe to run again and adds any new columns.) You should see "Success". This creates the tables, the privacy rules and the private `resumes` storage bucket.
3. Open **Project Settings → API** (or **Connect**) and copy:
   - **Project URL**, e.g. `https://abcd1234.supabase.co`
   - **anon / publishable key** (the public one, *not* the `service_role` / secret key)
4. **Authentication → URL Configuration:**
   - **Site URL:** your Vercel URL, e.g. `https://internship-copilot.vercel.app`
   - **Redirect URLs:** add `https://internship-copilot.vercel.app/**` and `http://localhost:5173/**`

### 2. Backend on Render
Your service from before just needs two more environment variables (**Environment** tab):

| Key | Value |
|---|---|
| `SUPABASE_URL` | Project URL from step 1 |
| `SUPABASE_ANON_KEY` | anon / publishable key from step 1 |
| `GROQ_API_KEY` | (already set) |
| `ALLOWED_ORIGINS` | your Vercel URL |

The API only answers signed-in users (the landing page's map and stats stay public), so `SUPABASE_URL` is required. For local development without Supabase, set `ALLOW_LOCAL_AUTH=1`.

### 3. Frontend on Vercel
Project settings: **Root Directory** `app/frontend`, framework **Vite**. Environment variables:

| Key | Value |
|---|---|
| `VITE_API_URL` | your Render URL, e.g. `https://internship-copilot-api.onrender.com` |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |

Then **Redeploy**: `VITE_` variables only apply to new builds.

### 4. Keep Supabase awake (optional)
Free Supabase projects pause after 7 days without traffic. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as GitHub
**repository secrets** too; the alert agent's 15-minute workflow then pings it so it never pauses.

---

## Run locally

```bash
# backend
cd app/backend && pip install -r requirements.txt
export GROQ_API_KEY=gsk_...                 # optional SUPABASE_URL / SUPABASE_ANON_KEY
uvicorn main:app --reload                    # http://localhost:8000/api/health

# frontend (new terminal)
cd app/frontend && npm install
cp .env.example .env.local                   # add your Supabase URL + key
npm run dev                                  # http://localhost:5173
```

The frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (put them in `app/frontend/.env.local`);
without them the login page explains what's missing. For automated browser tests only, `vite build --mode e2e`
swaps the data layer for a localStorage stand-in (`src/lib/backend.fake.js`), which is never part of a normal build.

Tests: `cd app/backend && python -m pytest -q` (fake LLM, sample data, auth and resume parsing covered).

## Use it like a Mac app
On the deployed site: Safari → **File → Add to Dock**, or Chrome → install icon in the address bar.
For a menu-bar widget with notifications, see [`../widget`](../widget/README.md).

## Applying faster
| Feature | Where |
|---|---|
| **Autofill** Workday, Greenhouse, Lever, Ashby forms from your profile, incl. work experience and role descriptions | Sidebar → Autofill (Chrome extension in [`../extension`](../extension/README.md)) |
| **Tailor your resume**: skills the listing asks for that you show / lack, bullets reworded for it (never invented) | Any role → details panel |
| **Find a referral**: LinkedIn searches for alumni, recruiters and engineers, plus a drafted note and message | Any role → details panel |
| **Opening soon**: when each company opens its summer internships, predicted from the last three seasons, with a watch list | Sidebar → Opening soon; also in every role's panel |
| **Your odds**: estimated applicants so far and the chance a person reviews your application (labelled as an estimate), plus a freshness / ghost-listing score from age and reposts | Any role → details panel; "Hide likely ghost listings" in Job listings |
| **Pipeline board**: Applied → Online assessment → Interviewing → Offer / Rejected, interview dates with Google Calendar / .ics, follow-up reminders | Applications |

Opening history comes from past snapshots of SimplifyJobs' listings (`agent/openings_history.json`, rebuilt with
`agent/build_history.py`); the agent adds the current season and publishes `openings.json` next to `jobs.json`.

After pulling this version, re-run `app/supabase/schema.sql` in the Supabase SQL editor (adds the online-assessment
stage and the interview / follow-up date columns). After changing the extension, run `python extension/build.py`.
