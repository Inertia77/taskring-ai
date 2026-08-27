begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(43);

-- 1-11: required business tables exist.
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'goals', 'goals exists');
select has_table('public', 'projects', 'projects exists');
select has_table('public', 'tasks', 'tasks exists');
select has_table('public', 'inbox_items', 'inbox_items exists');
select has_table('public', 'daily_plans', 'daily_plans exists');
select has_table('public', 'daily_plan_items', 'daily_plan_items exists');
select has_table('public', 'task_events', 'task_events exists');
select has_table('public', 'user_feedback', 'user_feedback exists');
select has_table('public', 'constraints', 'constraints exists');
select has_table('public', 'source_links', 'source_links exists');

-- 12: every business table has a single UUID primary-key column.
select ok(
  not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    join unnest(c.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute a on a.attrelid = r.oid and a.attnum = k.attnum
    where n.nspname = 'public'
      and r.relname = any(array[
        'profiles','goals','projects','tasks','inbox_items','daily_plans',
        'daily_plan_items','task_events','user_feedback','constraints','source_links'
      ])
      and c.contype = 'p'
      and a.atttypid <> 'uuid'::regtype
  )
  and (
    select count(*)
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = any(array[
        'profiles','goals','projects','tasks','inbox_items','daily_plans',
        'daily_plan_items','task_events','user_feedback','constraints','source_links'
      ])
      and c.contype = 'p'
  ) = 11,
  'all business PKs are UUID'
);

-- 13: each business table owns data directly through auth.users.
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = any(array[
        'profiles','goals','projects','tasks','inbox_items','daily_plans',
        'daily_plan_items','task_events','user_feedback','constraints','source_links'
      ])
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
  $$,
  $$values (11::bigint)$$,
  'all business tables reference auth.users'
);

-- 14: RLS is enabled 11/11.
select results_eq(
  $$
    select count(*)::bigint
    from pg_class r
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = any(array[
        'profiles','goals','projects','tasks','inbox_items','daily_plans',
        'daily_plan_items','task_events','user_feedback','constraints','source_links'
      ])
      and r.relrowsecurity
  $$,
  $$values (11::bigint)$$,
  'RLS enabled on all business tables'
);

-- 15: WP002 intentionally has no end-user RLS policies.
select results_eq(
  $$
    select count(*)::bigint
    from pg_policy p
    join pg_class r on r.oid = p.polrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = any(array[
        'profiles','goals','projects','tasks','inbox_items','daily_plans',
        'daily_plan_items','task_events','user_feedback','constraints','source_links'
      ])
  $$,
  $$values (0::bigint)$$,
  'no final user RLS policies exist in WP002'
);

-- 16-17: exposed API roles have no SELECT grants in WP002.
select results_eq(
  $$
    select count(*)::bigint
    from unnest(array[
      'profiles','goals','projects','tasks','inbox_items','daily_plans',
      'daily_plan_items','task_events','user_feedback','constraints','source_links'
    ]) as t(name)
    where has_table_privilege('anon', format('public.%I', name), 'SELECT')
  $$,
  $$values (0::bigint)$$,
  'anon has no SELECT grants on business tables'
);

select results_eq(
  $$
    select count(*)::bigint
    from unnest(array[
      'profiles','goals','projects','tasks','inbox_items','daily_plans',
      'daily_plan_items','task_events','user_feedback','constraints','source_links'
    ]) as t(name)
    where has_table_privilege('authenticated', format('public.%I', name), 'SELECT')
  $$,
  $$values (0::bigint)$$,
  'authenticated has no SELECT grants before WP003'
);

-- Synthetic test users only. Everything is rolled back.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'wp002-user1@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'wp002-user2@example.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'wp002-user3@example.invalid');

insert into public.goals (id, user_id, title, status) values
  ('11111111-aaaa-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Goal 1', 'active');

insert into public.projects (id, user_id, goal_id, title, status, priority_hint) values
  ('11111111-bbbb-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '11111111-aaaa-4111-8111-111111111111', 'Project 1', 'active', 'normal'),
  ('22222222-bbbb-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', null, 'Project 2', 'active', 'high');

insert into public.tasks (
  id, user_id, project_id, title, status, task_kind, execution_context, created_by
) values
  ('11111111-cccc-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '11111111-bbbb-4111-8111-111111111111', 'Task 1', 'active', 'normal', 'any', 'user'),
  ('22222222-cccc-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '22222222-bbbb-4222-8222-222222222222', 'Task 2', 'active', 'normal', 'deep', 'user');

insert into public.daily_plans (
  id, user_id, plan_date, revision, status, created_by
) values
  ('11111111-dddd-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '2026-08-27', 1, 'active', 'user'),
  ('22222222-dddd-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '2026-08-27', 1, 'active', 'user');

insert into public.daily_plan_items (
  id, user_id, plan_id, task_id, bucket, position, current_state
) values (
  '11111111-eeee-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '11111111-dddd-4111-8111-111111111111',
  '11111111-cccc-4111-8111-111111111111',
  'must', 0, 'planned'
);

-- 18: revision is unique for user/date.
select throws_ok(
  $$insert into public.daily_plans (user_id, plan_date, revision, status, created_by)
    values ('11111111-1111-4111-8111-111111111111', '2026-08-27', 1, 'draft', 'user')$$,
  '23505', null,
  'daily plan revision is unique per user/date'
);

-- 19: only one active plan per user/date.
select throws_ok(
  $$insert into public.daily_plans (user_id, plan_date, revision, status, created_by)
    values ('11111111-1111-4111-8111-111111111111', '2026-08-27', 2, 'active', 'user')$$,
  '23505', null,
  'only one active daily plan per user/date'
);

-- 20-22: cross-user owned references are rejected at the FK layer.
select throws_ok(
  $$insert into public.projects (user_id, goal_id, title, status)
    values ('22222222-2222-4222-8222-222222222222', '11111111-aaaa-4111-8111-111111111111', 'Bad project', 'active')$$,
  '23503', null,
  'project cannot reference another user goal'
);

select throws_ok(
  $$insert into public.tasks (user_id, project_id, title, status, task_kind, execution_context, created_by)
    values ('22222222-2222-4222-8222-222222222222', '11111111-bbbb-4111-8111-111111111111', 'Bad task', 'active', 'normal', 'any', 'user')$$,
  '23503', null,
  'task cannot reference another user project'
);

select throws_ok(
  $$insert into public.daily_plan_items (user_id, plan_id, task_id, bucket, position, current_state)
    values ('22222222-2222-4222-8222-222222222222', '22222222-dddd-4222-8222-222222222222', '11111111-cccc-4111-8111-111111111111', 'must', 0, 'planned')$$,
  '23503', null,
  'plan item cannot reference another user task'
);

-- 23: event progress is bounded.
select throws_ok(
  $$insert into public.task_events (id, user_id, task_id, event_type, occurred_at, progress_percent, actor)
    values ('11111111-0001-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '11111111-cccc-4111-8111-111111111111', 'partial', now(), 101, 'user')$$,
  '23514', null,
  'task event progress above 100 is rejected'
);

-- 24-26: negative minutes are rejected.
select throws_ok(
  $$insert into public.tasks (user_id, title, status, task_kind, estimate_minutes, execution_context, created_by)
    values ('11111111-1111-4111-8111-111111111111', 'Negative estimate', 'active', 'normal', -1, 'any', 'user')$$,
  '23514', null,
  'negative task estimate is rejected'
);

select throws_ok(
  $$insert into public.tasks (user_id, title, status, task_kind, remaining_minutes, execution_context, created_by)
    values ('11111111-1111-4111-8111-111111111111', 'Negative remaining', 'active', 'normal', -1, 'any', 'user')$$,
  '23514', null,
  'negative task remaining minutes are rejected'
);

select throws_ok(
  $$insert into public.daily_plan_items (user_id, plan_id, task_id, bucket, position, planned_minutes, current_state)
    values ('11111111-1111-4111-8111-111111111111', '11111111-dddd-4111-8111-111111111111', '11111111-cccc-4111-8111-111111111111', 'must', 2, -1, 'planned')$$,
  '23514', null,
  'negative plan-item minutes are rejected'
);

-- 27-28: a source link must point to exactly one entity.
select throws_ok(
  $$insert into public.source_links (user_id, source_type)
    values ('11111111-1111-4111-8111-111111111111', 'manual')$$,
  '23514', null,
  'source link with no entity is rejected'
);

select throws_ok(
  $$insert into public.source_links (user_id, task_id, project_id, source_type)
    values ('11111111-1111-4111-8111-111111111111', '11111111-cccc-4111-8111-111111111111', '11111111-bbbb-4111-8111-111111111111', 'manual')$$,
  '23514', null,
  'source link with multiple entities is rejected'
);

insert into public.source_links (
  user_id, task_id, source_type, external_id
) values (
  '11111111-1111-4111-8111-111111111111',
  '11111111-cccc-4111-8111-111111111111',
  'chat',
  'dedupe-1'
);

-- 29: source identity dedupe is enforced when external_id exists.
select throws_ok(
  $$insert into public.source_links (user_id, task_id, source_type, external_id)
    values ('11111111-1111-4111-8111-111111111111', '11111111-cccc-4111-8111-111111111111', 'chat', 'dedupe-1')$$,
  '23505', null,
  'source external identity is unique per user/source'
);

-- 30-35: additional check constraints.
select throws_ok(
  $$insert into public.tasks (user_id, title, status, task_kind, execution_context, checklist, created_by)
    values ('11111111-1111-4111-8111-111111111111', 'Bad checklist', 'active', 'normal', 'any', '{}'::jsonb, 'user')$$,
  '23514', null,
  'task checklist must be a JSON array'
);

select throws_ok(
  $$insert into public.constraints (user_id, kind, hardness, starts_at, ends_at)
    values ('11111111-1111-4111-8111-111111111111', 'fixed_event', 'hard', '2026-08-27 10:00+09', '2026-08-27 09:00+09')$$,
  '23514', null,
  'constraint end must be after start'
);

select throws_ok(
  $$insert into public.inbox_items (user_id, raw_input, source_type, confidence)
    values ('11111111-1111-4111-8111-111111111111', 'test', 'chat', 1.1)$$,
  '23514', null,
  'inbox confidence above 1 is rejected'
);

select throws_ok(
  $$insert into public.daily_plans (user_id, plan_date, revision, status, created_by)
    values ('11111111-1111-4111-8111-111111111111', '2026-08-28', 0, 'draft', 'user')$$,
  '23514', null,
  'daily plan revision must start at 1'
);

select throws_ok(
  $$insert into public.task_events (id, user_id, task_id, event_type, occurred_at, actual_minutes, actor)
    values ('11111111-0002-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '11111111-cccc-4111-8111-111111111111', 'done', now(), -1, 'user')$$,
  '23514', null,
  'negative actual event minutes are rejected'
);

select throws_ok(
  $$insert into public.task_events (id, user_id, task_id, event_type, occurred_at, remaining_minutes, actor)
    values ('11111111-0003-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '11111111-cccc-4111-8111-111111111111', 'partial', now(), -1, 'user')$$,
  '23514', null,
  'negative event remaining minutes are rejected'
);

-- 36-37: clients can pre-generate event UUIDs; duplicate IDs are naturally idempotency-safe.
select lives_ok(
  $$insert into public.task_events (id, user_id, task_id, plan_item_id, event_type, occurred_at, actor)
    values ('11111111-0004-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '11111111-cccc-4111-8111-111111111111', '11111111-eeee-4111-8111-111111111111', 'started', now(), 'user')$$,
  'client-generated task event UUID is accepted'
);

select throws_ok(
  $$insert into public.task_events (id, user_id, task_id, event_type, occurred_at, actor)
    values ('11111111-0004-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '11111111-cccc-4111-8111-111111111111', 'started', now(), 'user')$$,
  '23505', null,
  'duplicate event UUID is rejected by primary key'
);

-- 38-39: deleting auth.users cascades every private application row.
insert into public.profiles (user_id) values ('33333333-3333-4333-8333-333333333333');
insert into public.goals (id, user_id, title, status) values
  ('33333333-aaaa-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'Cascade goal', 'active');
insert into public.projects (id, user_id, goal_id, title, status) values
  ('33333333-bbbb-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '33333333-aaaa-4333-8333-333333333333', 'Cascade project', 'active');
insert into public.tasks (id, user_id, project_id, title, status, task_kind, execution_context, created_by) values
  ('33333333-cccc-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '33333333-bbbb-4333-8333-333333333333', 'Cascade task', 'active', 'normal', 'any', 'user');
insert into public.inbox_items (id, user_id, raw_input, source_type) values
  ('33333333-1111-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'cascade inbox', 'manual');
insert into public.daily_plans (id, user_id, plan_date, revision, status, created_by) values
  ('33333333-dddd-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '2026-08-27', 1, 'active', 'user');
insert into public.daily_plan_items (id, user_id, plan_id, task_id, bucket, position, current_state) values
  ('33333333-eeee-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '33333333-dddd-4333-8333-333333333333', '33333333-cccc-4333-8333-333333333333', 'must', 0, 'planned');
insert into public.task_events (id, user_id, task_id, plan_item_id, event_type, occurred_at, actor) values
  ('33333333-0001-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '33333333-cccc-4333-8333-333333333333', '33333333-eeee-4333-8333-333333333333', 'planned', now(), 'system');
insert into public.user_feedback (id, user_id, task_id, content, source) values
  ('33333333-2222-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '33333333-cccc-4333-8333-333333333333', 'cascade feedback', 'frontend');
insert into public.constraints (id, user_id, kind, hardness) values
  ('33333333-3334-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'preferred_window', 'soft');
insert into public.source_links (id, user_id, task_id, source_type) values
  ('33333333-4444-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '33333333-cccc-4333-8333-333333333333', 'manual');

select lives_ok(
  $$delete from auth.users where id = '33333333-3333-4333-8333-333333333333'$$,
  'deleting a user cascades application data without FK conflict'
);

select ok(
  (select count(*) from public.profiles where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.goals where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.projects where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.tasks where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.inbox_items where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.daily_plans where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.daily_plan_items where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.task_events where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.user_feedback where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.constraints where user_id = '33333333-3333-4333-8333-333333333333') = 0
  and (select count(*) from public.source_links where user_id = '33333333-3333-4333-8333-333333333333') = 0,
  'user cascade removes all 11 business-table rows'
);

-- 40-41: deleting a project detaches, but does not delete, tasks.
insert into public.projects (id, user_id, title, status) values
  ('11111111-bb01-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Disposable project', 'active');
insert into public.tasks (id, user_id, project_id, title, status, task_kind, execution_context, created_by) values
  ('11111111-cc01-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '11111111-bb01-4111-8111-111111111111', 'Detached task', 'active', 'normal', 'flex', 'user');

select lives_ok(
  $$delete from public.projects where id = '11111111-bb01-4111-8111-111111111111'$$,
  'project deletion succeeds without deleting its task'
);

select results_eq(
  $$select count(*)::bigint from public.tasks where id = '11111111-cc01-4111-8111-111111111111' and project_id is null$$,
  $$values (1::bigint)$$,
  'project deletion preserves task and clears project_id'
);

-- 42-43: deleting a goal detaches, but does not delete, projects.
insert into public.goals (id, user_id, title, status) values
  ('11111111-aa01-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Disposable goal', 'active');
insert into public.projects (id, user_id, goal_id, title, status) values
  ('11111111-bb02-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '11111111-aa01-4111-8111-111111111111', 'Detached project', 'active');

select lives_ok(
  $$delete from public.goals where id = '11111111-aa01-4111-8111-111111111111'$$,
  'goal deletion succeeds without deleting its project'
);

select results_eq(
  $$select count(*)::bigint from public.projects where id = '11111111-bb02-4111-8111-111111111111' and goal_id is null$$,
  $$values (1::bigint)$$,
  'goal deletion preserves project and clears goal_id'
);

select * from finish();
rollback;
