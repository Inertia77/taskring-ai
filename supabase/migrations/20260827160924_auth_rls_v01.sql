-- WP003: Auth + Ownership RLS v0.1
-- Identity truth remains auth.users. Public business rows are owned by user_id.

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
from anon, authenticated, service_role;

grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.goals,
  public.projects,
  public.tasks,
  public.inbox_items,
  public.daily_plans,
  public.daily_plan_items,
  public.user_feedback,
  public.constraints,
  public.source_links
to authenticated;

grant select, insert on table public.task_events to authenticated;

create policy profiles_owner_all
on public.profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy goals_owner_all
on public.goals
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy projects_owner_all
on public.projects
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy tasks_owner_all
on public.tasks
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy inbox_items_owner_all
on public.inbox_items
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy daily_plans_owner_all
on public.daily_plans
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy daily_plan_items_owner_all
on public.daily_plan_items
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy user_feedback_owner_all
on public.user_feedback
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy constraints_owner_all
on public.constraints
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy source_links_owner_all
on public.source_links
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy task_events_owner_select
on public.task_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy task_events_owner_insert
on public.task_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);
