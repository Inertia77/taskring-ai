begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

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

select ok(
  not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    join unnest(c.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = r.oid and a.attnum = k.attnum
    where n.nspname = 'public'
      and r.relname = any(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links'])
      and c.contype = 'p'
      and a.atttypid <> 'uuid'::regtype
  )
  and (
    select count(*) from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = any(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links'])
      and c.contype = 'p'
  ) = 11,
  'all business PKs are UUID'
);

select results_eq(
  $$select count(*)::bigint from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname = any(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links']) and c.contype='f' and c.confrelid='auth.users'::regclass$$,
  $$values (11::bigint)$$,
  'all business tables reference auth.users'
);

select results_eq(
  $$select count(*)::bigint from pg_class r join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname = any(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links']) and r.relrowsecurity$$,
  $$values (11::bigint)$$,
  'RLS enabled on all business tables'
);

select set_config('wp003.user_a', gen_random_uuid()::text, true);
select set_config('wp003.user_b', gen_random_uuid()::text, true);
select set_config('wp003.user_c', gen_random_uuid()::text, true);
select set_config('wp003.goal_a', gen_random_uuid()::text, true);
select set_config('wp003.project_a', gen_random_uuid()::text, true);
select set_config('wp003.project_b', gen_random_uuid()::text, true);
select set_config('wp003.task_a', gen_random_uuid()::text, true);
select set_config('wp003.task_b', gen_random_uuid()::text, true);
select set_config('wp003.plan_a', gen_random_uuid()::text, true);
select set_config('wp003.plan_b', gen_random_uuid()::text, true);
select set_config('wp003.plan_item_a', gen_random_uuid()::text, true);
select set_config('wp003.goal_c', gen_random_uuid()::text, true);
select set_config('wp003.project_c', gen_random_uuid()::text, true);
select set_config('wp003.task_c', gen_random_uuid()::text, true);

insert into auth.users (id, email) values
  (current_setting('wp003.user_a')::uuid, 'wp003-schema-a@example.invalid'),
  (current_setting('wp003.user_b')::uuid, 'wp003-schema-b@example.invalid'),
  (current_setting('wp003.user_c')::uuid, 'wp003-schema-c@example.invalid');

insert into public.goals (id,user_id,title,status) values
  (current_setting('wp003.goal_a')::uuid,current_setting('wp003.user_a')::uuid,'Goal A','active'),
  (current_setting('wp003.goal_c')::uuid,current_setting('wp003.user_c')::uuid,'Goal C','active');

insert into public.projects (id,user_id,goal_id,title,status) values
  (current_setting('wp003.project_a')::uuid,current_setting('wp003.user_a')::uuid,current_setting('wp003.goal_a')::uuid,'Project A','active'),
  (current_setting('wp003.project_b')::uuid,current_setting('wp003.user_b')::uuid,null,'Project B','active'),
  (current_setting('wp003.project_c')::uuid,current_setting('wp003.user_c')::uuid,current_setting('wp003.goal_c')::uuid,'Project C','active');

insert into public.tasks (id,user_id,project_id,title,status,task_kind,execution_context,created_by) values
  (current_setting('wp003.task_a')::uuid,current_setting('wp003.user_a')::uuid,current_setting('wp003.project_a')::uuid,'Task A','active','normal','any','user'),
  (current_setting('wp003.task_b')::uuid,current_setting('wp003.user_b')::uuid,current_setting('wp003.project_b')::uuid,'Task B','active','normal','deep','user'),
  (current_setting('wp003.task_c')::uuid,current_setting('wp003.user_c')::uuid,current_setting('wp003.project_c')::uuid,'Task C','active','normal','any','user');

select set_config('wp007.schema_previous_context', coalesce(current_setting('taskring.command_context', true), ''), true);
select set_config('taskring.command_context', 'publication:v1', true);
insert into public.daily_plans (id,user_id,plan_date,revision,status,created_by) values
  (current_setting('wp003.plan_a')::uuid,current_setting('wp003.user_a')::uuid,'2026-01-01',1,'active','user'),
  (current_setting('wp003.plan_b')::uuid,current_setting('wp003.user_b')::uuid,'2026-01-01',1,'active','user');

insert into public.daily_plan_items (id,user_id,plan_id,task_id,bucket,position,current_state) values
  (current_setting('wp003.plan_item_a')::uuid,current_setting('wp003.user_a')::uuid,current_setting('wp003.plan_a')::uuid,current_setting('wp003.task_a')::uuid,'must',0,'planned');
select set_config('taskring.command_context', current_setting('wp007.schema_previous_context'), true);

select set_config('wp007.schema_previous_context', coalesce(current_setting('taskring.command_context', true), ''), true);
select set_config('taskring.command_context', 'publication:v1', true);
select throws_ok(
  $$insert into public.daily_plans (user_id,plan_date,revision,status,created_by) values (current_setting('wp003.user_a')::uuid,'2026-01-01',1,'draft','user')$$,
  '23505', null, 'daily plan revision is unique per user/date'
);
select set_config('taskring.command_context', current_setting('wp007.schema_previous_context'), true);

select set_config('wp007.schema_previous_context', coalesce(current_setting('taskring.command_context', true), ''), true);
select set_config('taskring.command_context', 'publication:v1', true);
select throws_ok(
  $$insert into public.daily_plans (user_id,plan_date,revision,status,created_by) values (current_setting('wp003.user_a')::uuid,'2026-01-01',2,'active','user')$$,
  '23505', null, 'only one active daily plan per user/date'
);
select set_config('taskring.command_context', current_setting('wp007.schema_previous_context'), true);

select throws_ok(
  $$insert into public.projects (user_id,goal_id,title,status) values (current_setting('wp003.user_b')::uuid,current_setting('wp003.goal_a')::uuid,'Bad','active')$$,
  '23503', null, 'project cannot reference another user goal'
);

select throws_ok(
  $$insert into public.tasks (user_id,project_id,title,status,task_kind,execution_context,created_by) values (current_setting('wp003.user_b')::uuid,current_setting('wp003.project_a')::uuid,'Bad','active','normal','any','user')$$,
  '23503', null, 'task cannot reference another user project'
);

select set_config('wp007.schema_previous_context', coalesce(current_setting('taskring.command_context', true), ''), true);
select set_config('taskring.command_context', 'publication:v1', true);
select throws_ok(
  $$insert into public.daily_plan_items (user_id,plan_id,task_id,bucket,position,current_state) values (current_setting('wp003.user_b')::uuid,current_setting('wp003.plan_b')::uuid,current_setting('wp003.task_a')::uuid,'must',0,'planned')$$,
  '23503', null, 'plan item cannot reference another user task'
);
select set_config('taskring.command_context', current_setting('wp007.schema_previous_context'), true);

select set_config('wp007.schema_previous_context', coalesce(current_setting('taskring.command_context', true), ''), true);
select set_config('taskring.command_context', 'execution:v1', true);
select throws_ok(
  $$insert into public.task_events (id,user_id,task_id,event_type,occurred_at,progress_percent,actor) values (gen_random_uuid(),current_setting('wp003.user_a')::uuid,current_setting('wp003.task_a')::uuid,'partial',now(),101,'user')$$,
  '23514', null, 'task event progress above 100 is rejected'
);
select set_config('taskring.command_context', current_setting('wp007.schema_previous_context'), true);

select throws_ok(
  $$insert into public.tasks (user_id,title,status,task_kind,estimate_minutes,execution_context,created_by) values (current_setting('wp003.user_a')::uuid,'Negative','active','normal',-1,'any','user')$$,
  '23514', null, 'negative task estimate is rejected'
);

select throws_ok(
  $$insert into public.tasks (user_id,title,status,task_kind,remaining_minutes,execution_context,created_by) values (current_setting('wp003.user_a')::uuid,'Negative','active','normal',-1,'any','user')$$,
  '23514', null, 'negative task remaining minutes are rejected'
);

select set_config('wp007.schema_previous_context', coalesce(current_setting('taskring.command_context', true), ''), true);
select set_config('taskring.command_context', 'publication:v1', true);
select throws_ok(
  $$insert into public.daily_plan_items (user_id,plan_id,task_id,bucket,position,planned_minutes,current_state) values (current_setting('wp003.user_a')::uuid,current_setting('wp003.plan_a')::uuid,current_setting('wp003.task_a')::uuid,'must',2,-1,'planned')$$,
  '23514', null, 'negative planned minutes are rejected'
);
select set_config('taskring.command_context', current_setting('wp007.schema_previous_context'), true);

select throws_ok(
  $$insert into public.source_links (user_id,source_type) values (current_setting('wp003.user_a')::uuid,'manual')$$,
  '23514', null, 'source link requires exactly one entity'
);

select throws_ok(
  $$insert into public.source_links (user_id,task_id,project_id,source_type) values (current_setting('wp003.user_a')::uuid,current_setting('wp003.task_a')::uuid,current_setting('wp003.project_a')::uuid,'manual')$$,
  '23514', null, 'source link rejects multiple entities'
);

insert into public.source_links (user_id,task_id,source_type,external_id) values (current_setting('wp003.user_a')::uuid,current_setting('wp003.task_a')::uuid,'chat','dedupe-local');
select throws_ok(
  $$insert into public.source_links (user_id,task_id,source_type,external_id) values (current_setting('wp003.user_a')::uuid,current_setting('wp003.task_a')::uuid,'chat','dedupe-local')$$,
  '23505', null, 'source identity dedupe is enforced'
);

select throws_ok(
  $$insert into public.tasks (user_id,title,status,task_kind,execution_context,checklist,created_by) values (current_setting('wp003.user_a')::uuid,'Bad checklist','active','normal','any','{}'::jsonb,'user')$$,
  '23514', null, 'checklist must be a JSON array'
);

select throws_ok(
  $$insert into public.constraints (user_id,kind,hardness,starts_at,ends_at) values (current_setting('wp003.user_a')::uuid,'fixed_event','hard','2026-01-01 10:00+00','2026-01-01 09:00+00')$$,
  '23514', null, 'constraint end must follow start'
);

select throws_ok(
  $$insert into public.inbox_items (user_id,raw_input,source_type,confidence) values (current_setting('wp003.user_a')::uuid,'x','chat',1.1)$$,
  '23514', null, 'inbox confidence is bounded'
);

select set_config('wp007.schema_previous_context', coalesce(current_setting('taskring.command_context', true), ''), true);
select set_config('taskring.command_context', 'publication:v1', true);
select throws_ok(
  $$insert into public.daily_plans (user_id,plan_date,revision,status,created_by) values (current_setting('wp003.user_a')::uuid,'2026-01-02',0,'draft','user')$$,
  '23514', null, 'daily plan revision starts at one'
);
select set_config('taskring.command_context', current_setting('wp007.schema_previous_context'), true);

select set_config('wp007.schema_previous_context', coalesce(current_setting('taskring.command_context', true), ''), true);
select set_config('taskring.command_context', 'execution:v1', true);
select throws_ok(
  $$insert into public.task_events (id,user_id,task_id,event_type,occurred_at,actual_minutes,actor) values (gen_random_uuid(),current_setting('wp003.user_a')::uuid,current_setting('wp003.task_a')::uuid,'done',now(),-1,'user')$$,
  '23514', null, 'negative actual minutes are rejected'
);
select set_config('taskring.command_context', current_setting('wp007.schema_previous_context'), true);

delete from public.goals where id=current_setting('wp003.goal_c')::uuid;
select results_eq(
  $$select (goal_id is null) from public.projects where id=current_setting('wp003.project_c')::uuid$$,
  $$values (true)$$,
  'deleting a goal detaches rather than deletes its project'
);

delete from public.projects where id=current_setting('wp003.project_c')::uuid;
select results_eq(
  $$select (project_id is null) from public.tasks where id=current_setting('wp003.task_c')::uuid$$,
  $$values (true)$$,
  'deleting a project detaches rather than deletes its task'
);

delete from auth.users where id=current_setting('wp003.user_c')::uuid;
select results_eq(
  $$select count(*)::bigint from public.tasks where id=current_setting('wp003.task_c')::uuid$$,
  $$values (0::bigint)$$,
  'deleting auth user cascades private application data'
);

select * from finish();
rollback;
