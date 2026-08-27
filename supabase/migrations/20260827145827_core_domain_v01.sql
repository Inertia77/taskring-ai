-- TaskRing AI Secretary Core Domain Schema v0.1
-- WP002: data model, integrity, event history, and secure-by-default foundation.

-- Opt into explicit Data API grants for future public objects.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  locale text,
  planning_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_planning_preferences_object_check
    check (jsonb_typeof(planning_preferences) = 'object')
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null,
  target_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_id_user_id_unique unique (id, user_id),
  constraint goals_status_check check (status in ('active', 'paused', 'done', 'cancelled'))
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  title text not null,
  status text not null,
  priority_hint text,
  target_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_id_user_id_unique unique (id, user_id),
  constraint projects_status_check check (status in ('active', 'paused', 'waiting', 'done', 'cancelled')),
  constraint projects_priority_hint_check check (priority_hint is null or priority_hint in ('low', 'normal', 'high', 'critical')),
  constraint projects_goal_owner_fk
    foreign key (goal_id, user_id)
    references public.goals(id, user_id)
    on delete set null (goal_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  title text not null,
  description text,
  status text not null,
  task_kind text not null,
  priority_hint text,
  due_at timestamptz,
  not_before timestamptz,
  estimate_minutes integer,
  remaining_minutes integer,
  execution_context text not null,
  recurrence_rule text,
  recurrence_timezone text,
  checklist jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tasks_id_user_id_unique unique (id, user_id),
  constraint tasks_status_check check (status in ('active', 'waiting', 'blocked', 'paused', 'someday', 'done', 'cancelled')),
  constraint tasks_task_kind_check check (task_kind in ('normal', 'routine', 'game')),
  constraint tasks_priority_hint_check check (priority_hint is null or priority_hint in ('low', 'normal', 'high', 'critical')),
  constraint tasks_execution_context_check check (execution_context in ('any', 'deep', 'flex')),
  constraint tasks_created_by_check check (created_by in ('user', 'ai', 'system', 'import')),
  constraint tasks_estimate_minutes_check check (estimate_minutes is null or estimate_minutes >= 0),
  constraint tasks_remaining_minutes_check check (remaining_minutes is null or remaining_minutes >= 0),
  constraint tasks_checklist_array_check check (jsonb_typeof(checklist) = 'array'),
  constraint tasks_project_owner_fk
    foreign key (project_id, user_id)
    references public.projects(id, user_id)
    on delete set null (project_id)
);

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_input text not null,
  source_type text not null,
  source_external_id text,
  interpreted_kind text,
  interpreted_payload jsonb not null default '{}'::jsonb,
  confidence numeric,
  needs_review boolean not null default false,
  disposition text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint inbox_items_id_user_id_unique unique (id, user_id),
  constraint inbox_items_interpreted_kind_check
    check (interpreted_kind is null or interpreted_kind in ('goal', 'project', 'task', 'reference', 'non_task', 'unknown')),
  constraint inbox_items_payload_object_check check (jsonb_typeof(interpreted_payload) = 'object'),
  constraint inbox_items_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint inbox_items_disposition_check check (disposition in ('pending', 'accepted', 'rejected', 'merged'))
);

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  revision integer not null,
  status text not null,
  capacity_minutes integer,
  capacity_breakdown jsonb not null default '{}'::jsonb,
  brief text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint daily_plans_id_user_id_unique unique (id, user_id),
  constraint daily_plans_revision_unique unique (user_id, plan_date, revision),
  constraint daily_plans_revision_check check (revision >= 1),
  constraint daily_plans_status_check check (status in ('draft', 'active', 'superseded')),
  constraint daily_plans_capacity_minutes_check check (capacity_minutes is null or capacity_minutes >= 0),
  constraint daily_plans_capacity_breakdown_object_check check (jsonb_typeof(capacity_breakdown) = 'object'),
  constraint daily_plans_created_by_check check (created_by in ('user', 'ai', 'system'))
);

create table public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  task_id uuid not null,
  bucket text not null,
  position integer not null,
  planned_minutes integer,
  reason text,
  carryover_from_item_id uuid,
  current_state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_plan_items_id_user_id_unique unique (id, user_id),
  constraint daily_plan_items_bucket_check check (bucket in ('must', 'should', 'main_quest', 'flex', 'routine', 'game', 'bonus')),
  constraint daily_plan_items_position_check check (position >= 0),
  constraint daily_plan_items_planned_minutes_check check (planned_minutes is null or planned_minutes >= 0),
  constraint daily_plan_items_current_state_check
    check (current_state in ('planned', 'started', 'partial', 'done', 'skipped', 'deferred', 'blocked', 'cancelled')),
  constraint daily_plan_items_plan_owner_fk
    foreign key (plan_id, user_id)
    references public.daily_plans(id, user_id)
    on delete cascade,
  constraint daily_plan_items_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks(id, user_id),
  constraint daily_plan_items_carryover_owner_fk
    foreign key (carryover_from_item_id, user_id)
    references public.daily_plan_items(id, user_id)
    on delete set null (carryover_from_item_id)
);

create table public.task_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  plan_item_id uuid,
  event_type text not null,
  occurred_at timestamptz not null,
  progress_percent numeric,
  remaining_minutes integer,
  actual_minutes integer,
  reason text,
  note text,
  actor text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint task_events_id_user_id_unique unique (id, user_id),
  constraint task_events_event_type_check
    check (event_type in ('planned', 'started', 'partial', 'done', 'skipped', 'deferred', 'blocked', 'cancelled', 'reopened')),
  constraint task_events_progress_percent_check
    check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)),
  constraint task_events_remaining_minutes_check check (remaining_minutes is null or remaining_minutes >= 0),
  constraint task_events_actual_minutes_check check (actual_minutes is null or actual_minutes >= 0),
  constraint task_events_actor_check check (actor in ('user', 'ai', 'system', 'import')),
  constraint task_events_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint task_events_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks(id, user_id),
  constraint task_events_plan_item_owner_fk
    foreign key (plan_item_id, user_id)
    references public.daily_plan_items(id, user_id)
    on delete set null (plan_item_id)
);

create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid,
  plan_id uuid,
  plan_item_id uuid,
  content text not null,
  source text not null,
  ai_interpretation jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint user_feedback_id_user_id_unique unique (id, user_id),
  constraint user_feedback_source_check check (source in ('frontend', 'chat', 'ai_review', 'import')),
  constraint user_feedback_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks(id, user_id)
    on delete set null (task_id),
  constraint user_feedback_plan_owner_fk
    foreign key (plan_id, user_id)
    references public.daily_plans(id, user_id)
    on delete set null (plan_id),
  constraint user_feedback_plan_item_owner_fk
    foreign key (plan_item_id, user_id)
    references public.daily_plan_items(id, user_id)
    on delete set null (plan_item_id)
);

create table public.constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  hardness text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  recurrence_rule text,
  source_type text,
  source_external_id text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint constraints_id_user_id_unique unique (id, user_id),
  constraint constraints_kind_check check (kind in ('work_block', 'fixed_event', 'unavailable', 'preferred_window', 'office_flex')),
  constraint constraints_hardness_check check (hardness in ('hard', 'soft')),
  constraint constraints_time_order_check check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint constraints_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table public.source_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid,
  project_id uuid,
  goal_id uuid,
  inbox_item_id uuid,
  source_type text not null,
  external_id text,
  external_url text,
  last_seen_at timestamptz,
  snapshot_hash text,
  created_at timestamptz not null default now(),
  constraint source_links_id_user_id_unique unique (id, user_id),
  constraint source_links_source_type_check
    check (source_type in ('chat', 'manual', 'legacy_taskring', 'inertia_1', 'inertia_2', 'inertia_3', 'inertia_4', 'notion_ai_daily', 'gucc', 'gmail', 'calendar', 'microsoft_todo_import')),
  constraint source_links_exactly_one_entity_check
    check (num_nonnulls(task_id, project_id, goal_id, inbox_item_id) = 1),
  constraint source_links_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks(id, user_id)
    on delete cascade,
  constraint source_links_project_owner_fk
    foreign key (project_id, user_id)
    references public.projects(id, user_id)
    on delete cascade,
  constraint source_links_goal_owner_fk
    foreign key (goal_id, user_id)
    references public.goals(id, user_id)
    on delete cascade,
  constraint source_links_inbox_owner_fk
    foreign key (inbox_item_id, user_id)
    references public.inbox_items(id, user_id)
    on delete cascade
);

-- User-owned query indexes. Every user_id is indexed either directly, by PK, or as
-- the leading key of a composite/unique index.
create index goals_user_id_idx on public.goals(user_id);
create index projects_user_id_idx on public.projects(user_id);
create index tasks_user_status_idx on public.tasks(user_id, status);
create index tasks_user_due_at_idx on public.tasks(user_id, due_at);
create index tasks_user_project_idx on public.tasks(user_id, project_id);
create index inbox_items_user_disposition_created_idx on public.inbox_items(user_id, disposition, created_at);
create index daily_plans_user_plan_date_idx on public.daily_plans(user_id, plan_date);
create unique index daily_plans_one_active_per_day_idx
  on public.daily_plans(user_id, plan_date)
  where status = 'active';
create index daily_plan_items_user_plan_bucket_position_idx
  on public.daily_plan_items(user_id, plan_id, bucket, position);
create index task_events_user_task_occurred_idx
  on public.task_events(user_id, task_id, occurred_at desc);
create index task_events_user_occurred_idx
  on public.task_events(user_id, occurred_at desc);
create index user_feedback_user_created_idx on public.user_feedback(user_id, created_at desc);
create index constraints_user_active_starts_idx on public.constraints(user_id, active, starts_at);
create index source_links_user_source_idx on public.source_links(user_id, source_type);
create unique index source_links_external_dedupe_idx
  on public.source_links(user_id, source_type, external_id)
  where external_id is not null;

-- Secure by default: exposed public tables have RLS enabled immediately and WP002
-- intentionally defines no end-user policies. Explicit grants arrive in WP003.
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.inbox_items enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_plan_items enable row level security;
alter table public.task_events enable row level security;
alter table public.user_feedback enable row level security;
alter table public.constraints enable row level security;
alter table public.source_links enable row level security;

revoke all privileges on table
  public.profiles,
  public.goals,
  public.projects,
  public.tasks,
  public.inbox_items,
  public.daily_plans,
  public.daily_plan_items,
  public.task_events,
  public.user_feedback,
  public.constraints,
  public.source_links
from anon, authenticated, service_role, public;
