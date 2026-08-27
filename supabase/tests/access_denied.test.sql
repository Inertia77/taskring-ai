begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

select results_eq(
  $$select count(*)::bigint from unnest(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links']) t(name) cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p(privilege) where has_table_privilege('anon',format('public.%I',name),privilege)$$,
  $$values (0::bigint)$$,
  'anon has zero business DML grants'
);

select results_eq(
  $$select count(*)::bigint from unnest(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links']) t(name) cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p(privilege) where has_table_privilege('service_role',format('public.%I',name),privilege)$$,
  $$values (0::bigint)$$,
  'service_role is not casually granted business DML'
);

select results_eq(
  $$select count(*)::bigint from unnest(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links']) t(name) where has_table_privilege('authenticated',format('public.%I',name),'SELECT')$$,
  $$values (11::bigint)$$,
  'authenticated SELECT grants cover all business tables'
);

select results_eq(
  $$select count(*)::bigint from unnest(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links']) t(name) where has_table_privilege('authenticated',format('public.%I',name),'INSERT')$$,
  $$values (11::bigint)$$,
  'authenticated INSERT grants cover all business tables'
);

select results_eq(
  $$select count(*)::bigint from unnest(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links']) t(name) where has_table_privilege('authenticated',format('public.%I',name),'UPDATE')$$,
  $$values (10::bigint)$$,
  'authenticated UPDATE excludes task_events'
);

select results_eq(
  $$select count(*)::bigint from unnest(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links']) t(name) where has_table_privilege('authenticated',format('public.%I',name),'DELETE')$$,
  $$values (10::bigint)$$,
  'authenticated DELETE excludes task_events'
);

select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname='public' and tablename = any(array['profiles','goals','projects','tasks','inbox_items','daily_plans','daily_plan_items','task_events','user_feedback','constraints','source_links'])$$,
  $$values (12::bigint)$$,
  'exactly twelve ownership policies exist'
);

select results_eq(
  $$select count(*)::bigint from pg_policies p, unnest(p.roles) r(role) where p.schemaname='public' and p.policyname like '%_owner_all' and p.cmd='ALL' and r.role='authenticated' and p.qual is not null and p.with_check is not null$$,
  $$values (10::bigint)$$,
  'ten owner-all policies have authenticated USING and WITH CHECK'
);

select results_eq(
  $$select count(*)::bigint from pg_policies p, unnest(p.roles) r(role) where p.schemaname='public' and p.tablename='task_events' and p.policyname in ('task_events_owner_select','task_events_owner_insert') and r.role='authenticated'$$,
  $$values (2::bigint)$$,
  'task_events has separate owner select and insert policies'
);

select set_config('wp003.user_a', gen_random_uuid()::text, true);
select set_config('wp003.user_b', gen_random_uuid()::text, true);
select set_config('wp003.task_b', gen_random_uuid()::text, true);
select set_config('wp003.task_keep_a', gen_random_uuid()::text, true);
select set_config('wp003.task_crud_a', gen_random_uuid()::text, true);
select set_config('wp003.event_a', gen_random_uuid()::text, true);

insert into auth.users (id,email) values
  (current_setting('wp003.user_a')::uuid,'wp003-rls-a@example.invalid'),
  (current_setting('wp003.user_b')::uuid,'wp003-rls-b@example.invalid');

insert into public.tasks (id,user_id,title,status,task_kind,execution_context,created_by) values
  (current_setting('wp003.task_keep_a')::uuid,current_setting('wp003.user_a')::uuid,'A keep','active','normal','any','user'),
  (current_setting('wp003.task_b')::uuid,current_setting('wp003.user_b')::uuid,'B private','active','normal','any','user');

set local role anon;
select throws_ok($$select count(*) from public.tasks$$,'42501',null,'anon SELECT denied');
select throws_ok($$insert into public.tasks (user_id,title,status,task_kind,execution_context,created_by) values (gen_random_uuid(),'x','active','normal','any','user')$$,'42501',null,'anon INSERT denied');
select throws_ok($$update public.tasks set title='x'$$,'42501',null,'anon UPDATE denied');
select throws_ok($$delete from public.tasks$$,'42501',null,'anon DELETE denied');
reset role;

select set_config('request.jwt.claim.sub', current_setting('wp003.user_a'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$insert into public.tasks (id,user_id,title,status,task_kind,execution_context,created_by) values (current_setting('wp003.task_crud_a')::uuid,current_setting('wp003.user_a')::uuid,'A own','active','normal','any','user')$$,
  'User A can insert own task'
);

select results_eq(
  $$select count(*)::bigint from public.tasks where id=current_setting('wp003.task_crud_a')::uuid$$,
  $$values (1::bigint)$$,
  'User A can select own task'
);

select lives_ok(
  $$update public.tasks set title='A updated' where id=current_setting('wp003.task_crud_a')::uuid$$,
  'User A can update own task'
);

select lives_ok(
  $$delete from public.tasks where id=current_setting('wp003.task_crud_a')::uuid$$,
  'User A can delete own task'
);

select results_eq(
  $$select count(*)::bigint from public.tasks where id=current_setting('wp003.task_b')::uuid$$,
  $$values (0::bigint)$$,
  'User A cannot select User B task'
);

select results_eq(
  $$with changed as (update public.tasks set title='stolen' where id=current_setting('wp003.task_b')::uuid returning 1) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'User A cannot update User B task'
);

select results_eq(
  $$with removed as (delete from public.tasks where id=current_setting('wp003.task_b')::uuid returning 1) select count(*)::bigint from removed$$,
  $$values (0::bigint)$$,
  'User A cannot delete User B task'
);

select throws_ok(
  $$insert into public.tasks (user_id,title,status,task_kind,execution_context,created_by) values (current_setting('wp003.user_b')::uuid,'spoof','active','normal','any','user')$$,
  '42501', null, 'User A cannot insert a row owned by User B'
);

select throws_ok(
  $$update public.tasks set user_id=current_setting('wp003.user_b')::uuid where id=current_setting('wp003.task_keep_a')::uuid$$,
  '42501', null, 'User A cannot transfer ownership to User B'
);

select lives_ok(
  $$insert into public.task_events (id,user_id,task_id,event_type,occurred_at,actor) values (current_setting('wp003.event_a')::uuid,current_setting('wp003.user_a')::uuid,current_setting('wp003.task_keep_a')::uuid,'started',now(),'user')$$,
  'User A can insert own task event'
);

select results_eq(
  $$select count(*)::bigint from public.task_events where id=current_setting('wp003.event_a')::uuid$$,
  $$values (1::bigint)$$,
  'User A can select own task event'
);

select throws_ok(
  $$update public.task_events set note='rewrite' where id=current_setting('wp003.event_a')::uuid$$,
  '42501', null, 'task_events UPDATE is denied'
);

select throws_ok(
  $$delete from public.task_events where id=current_setting('wp003.event_a')::uuid$$,
  '42501', null, 'task_events DELETE is denied'
);

select throws_ok(
  $$insert into public.task_events (id,user_id,task_id,event_type,occurred_at,actor) values (gen_random_uuid(),current_setting('wp003.user_b')::uuid,current_setting('wp003.task_b')::uuid,'started',now(),'user')$$,
  '42501', null, 'User A cannot insert User B task event'
);

reset role;
select * from finish();
rollback;
