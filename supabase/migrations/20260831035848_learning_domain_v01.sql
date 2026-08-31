-- INC-DB-001 R2: formally adopt Learning as a first-class TaskRing domain.
--
-- This migration is intentionally schema-only. Personal learning state belongs in
-- Production/private data and MUST NOT be seeded from the public repository.
--
-- The IF NOT EXISTS clauses are required so the migration can both:
--   1. build the generic Learning domain from a fresh database; and
--   2. non-destructively adopt the matching schema already present in Production.

create schema if not exists learning;

create table if not exists learning.domains (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('language', 'knowledge')),
  priority smallint not null default 3 check (priority between 1 and 5),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists learning.topics (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references learning.domains(id) on delete cascade,
  parent_topic_id uuid references learning.topics(id) on delete set null,
  slug text not null,
  name text not null,
  description text,
  difficulty numeric(4,2) check (difficulty is null or (difficulty >= 0 and difficulty <= 10)),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain_id, slug)
);

create table if not exists learning.prerequisites (
  topic_id uuid not null references learning.topics(id) on delete cascade,
  prerequisite_topic_id uuid not null references learning.topics(id) on delete cascade,
  strength numeric(4,3) not null default 1.0 check (strength > 0 and strength <= 1),
  created_at timestamptz not null default now(),
  primary key (topic_id, prerequisite_topic_id),
  check (topic_id <> prerequisite_topic_id)
);

create table if not exists learning.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'paused')),
  starts_on date,
  ends_on date,
  goals jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists seasons_one_active_idx
  on learning.seasons ((status))
  where status = 'active';

create table if not exists learning.sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  season_id uuid references learning.seasons(id) on delete set null,
  mode text not null default 'standard' check (mode in ('lite', 'standard', 'deep')),
  planned_minutes integer check (planned_minutes is null or planned_minutes > 0),
  actual_minutes integer check (actual_minutes is null or actual_minutes >= 0),
  status text not null default 'planned' check (status in ('planned', 'published', 'started', 'completed', 'skipped')),
  notion_url text,
  summary text,
  planner_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_date)
);

create table if not exists learning.session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references learning.sessions(id) on delete cascade,
  topic_id uuid references learning.topics(id) on delete set null,
  domain_id uuid references learning.domains(id) on delete set null,
  item_type text not null check (item_type in ('new', 'review', 'practice', 'connection', 'assessment')),
  position integer not null default 0,
  planned_minutes integer check (planned_minutes is null or planned_minutes > 0),
  objective text,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists learning.feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references learning.sessions(id) on delete cascade,
  session_item_id uuid references learning.session_items(id) on delete cascade,
  raw_text text,
  difficulty numeric(4,2) check (difficulty is null or (difficulty >= 0 and difficulty <= 10)),
  confidence numeric(4,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  interest numeric(4,2) check (interest is null or (interest >= 0 and interest <= 1)),
  completion numeric(4,2) check (completion is null or (completion >= 0 and completion <= 1)),
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists learning.mastery_evidence (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references learning.topics(id) on delete cascade,
  session_id uuid references learning.sessions(id) on delete set null,
  evidence_type text not null,
  score numeric(5,4) not null check (score >= 0 and score <= 1),
  weight numeric(5,4) not null default 1 check (weight > 0),
  notes text,
  observed_at timestamptz not null default now()
);

create table if not exists learning.mastery (
  topic_id uuid primary key references learning.topics(id) on delete cascade,
  mastery_score numeric(5,4) not null default 0 check (mastery_score >= 0 and mastery_score <= 1),
  confidence numeric(5,4) not null default 0 check (confidence >= 0 and confidence <= 1),
  last_practiced_at timestamptz,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists learning.review_queue (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references learning.topics(id) on delete cascade,
  due_at timestamptz not null,
  interval_days numeric(8,2) not null default 1 check (interval_days > 0),
  ease numeric(6,3) not null default 2.5 check (ease > 0),
  priority numeric(6,3) not null default 1,
  reason text,
  status text not null default 'due' check (status in ('due', 'scheduled', 'done', 'snoozed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_queue_due_idx
  on learning.review_queue (status, due_at);

create table if not exists learning.planner_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Learning is an internal domain, not a browser-facing Data API surface.
-- RLS is enabled as defense in depth, but no browser policies are created.
alter table learning.domains enable row level security;
alter table learning.topics enable row level security;
alter table learning.prerequisites enable row level security;
alter table learning.seasons enable row level security;
alter table learning.sessions enable row level security;
alter table learning.session_items enable row level security;
alter table learning.feedback enable row level security;
alter table learning.mastery_evidence enable row level security;
alter table learning.mastery enable row level security;
alter table learning.review_queue enable row level security;
alter table learning.planner_state enable row level security;

-- Preserve the existing internal-admin access model while explicitly denying
-- direct browser/Data API roles. Table owners/admin tooling can continue to
-- operate without FORCE ROW LEVEL SECURITY.
revoke all privileges on schema learning from public, anon, authenticated, service_role;
revoke all privileges on all tables in schema learning from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema learning from public, anon, authenticated, service_role;
revoke all privileges on all functions in schema learning from public, anon, authenticated, service_role;

-- Keep future objects created by postgres in this private schema private by default.
alter default privileges for role postgres in schema learning
  revoke all privileges on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema learning
  revoke all privileges on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema learning
  revoke all privileges on functions from public, anon, authenticated, service_role;
