-- Internship Copilot database schema for Supabase.
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste this file -> Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).

-- ─────────────────────────────────────────────────────────────
-- Profiles: one row per user, filled in by onboarding
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  based_in text,                       -- current city, e.g. "Bengaluru, India"
  college text,
  degree text,                         -- e.g. "B.E. / B.Tech"
  major text,
  degree_level text default 'bachelors' check (degree_level in ('high_school','bachelors','masters','phd','other')),
  grad_year int,
  year_of_study text,                  -- e.g. "2nd year"
  skills text[] default '{}',
  roles text[] default '{}',           -- interest areas: "Backend", "AI / ML", ...
  avoid_roles text[] default '{}',     -- e.g. "Frontend only"
  locations text[] default '{}',       -- preferred cities / regions
  work_modes text[] default '{}',      -- "remote", "hybrid", "onsite"
  remote_from date, remote_to date,    -- when you could intern remotely
  onsite_from date, onsite_to date,    -- when you could intern in person
  us_work_auth text default 'not_applicable'
    check (us_work_auth in ('citizen','authorized','needs_sponsorship','not_applicable')),
  paid_only boolean default false,
  min_stipend_inr int,
  company_types text[] default '{}',   -- "Big tech", "Startups", ...
  headline text,                       -- one-line bio for the portfolio
  bio text,
  linkedin text, github text, portfolio text,
  resume_path text,                    -- path in the 'resumes' storage bucket
  resume_text text,                    -- extracted text, used for AI review
  onboarded boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Applications tracker
-- ─────────────────────────────────────────────────────────────
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  job_id text not null,
  title text not null,
  company text,
  url text,
  location text,
  terms text[] default '{}',
  fit int,
  status text not null default 'Applied' check (status in ('Applied','Interviewing','Offer','Rejected')),
  notes text default '',
  applied_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, job_id)
);
create index if not exists applications_user_idx on public.applications (user_id, applied_at desc);

-- ─────────────────────────────────────────────────────────────
-- Saved (bookmarked) jobs
-- ─────────────────────────────────────────────────────────────
create table if not exists public.saved_jobs (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  job_id text not null,
  job jsonb not null,                  -- snapshot of the listing when saved
  saved_at timestamptz default now(),
  primary key (user_id, job_id)
);

-- ─────────────────────────────────────────────────────────────
-- Portfolio projects
-- ─────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null,
  description text,
  url text,
  tech text[] default '{}',
  position int default 0,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security: everyone can only see and change their own rows
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.projects enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own applications" on public.applications;
create policy "own applications" on public.applications for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own saved" on public.saved_jobs;
create policy "own saved" on public.saved_jobs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Create an empty profile automatically when someone signs up
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists applications_touch on public.applications;
create trigger applications_touch before update on public.applications for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Private resume storage: each user can only touch files in their own folder (<user id>/...)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "own resumes read" on storage.objects;
create policy "own resumes read" on storage.objects for select
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own resumes write" on storage.objects;
create policy "own resumes write" on storage.objects for insert
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own resumes update" on storage.objects;
create policy "own resumes update" on storage.objects for update
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own resumes delete" on storage.objects;
create policy "own resumes delete" on storage.objects for delete
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
