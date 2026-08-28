begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

select results_eq(
  $$select count(*)::bigint from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='publish_daily_plan_v01'$$,
  $$values (1::bigint)$$,
  'publish function exists exactly once'
);

select results_eq(
  $$select (not p.prosecdef) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='publish_daily_plan_v01'$$,
  $$values (true)$$,
  'publish function is SECURITY INVOKER'
);

select results_eq(
  $$select coalesce(array_to_string(p.proconfig, ','),'') like '%search_path=%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='publish_daily_plan_v01'$$,
  $$values (true)$$,
  'publish function pins search_path'
);

select ok(
  not has_function_privilege('public', 'public.publish_daily_plan_v01(date,uuid,jsonb,integer,jsonb,text)', 'EXECUTE'),
  'PUBLIC execute denied'
);
select ok(
  not has_function_privilege('anon', 'public.publish_daily_plan_v01(date,uuid,jsonb,integer,jsonb,text)', 'EXECUTE'),
  'anon execute denied'
);
select ok(
  not has_function_privilege('service_role', 'public.publish_daily_plan_v01(date,uuid,jsonb,integer,jsonb,text)', 'EXECUTE'),
  'service_role execute not casually granted'
);
select ok(
  has_function_privilege('authenticated', 'public.publish_daily_plan_v01(date,uuid,jsonb,integer,jsonb,text)', 'EXECUTE'),
  'authenticated execute granted'
);

select set_config('wp006.user_a', gen_random_uuid()::text, true);
select set_config('wp006.user_b', gen_random_uuid()::text, true);
select set_config('wp006.task_a1', gen_random_uuid()::text, true);
select set_config('wp006.task_a2', gen_random_uuid()::text, true);
select set_config('wp006.task_b1', gen_random_uuid()::text, true);

insert into auth.users (id,email) values
  (current_setting('wp006.user_a')::uuid,'wp006-rls-a@example.invalid'),
  (current_setting('wp006.user_b')::uuid,'wp006-rls-b@example.invalid');

insert into public.tasks (id,user_id,title,status,task_kind,execution_context,created_by) values
  (current_setting('wp006.task_a1')::uuid,current_setting('wp006.user_a')::uuid,'A one','active','normal','any','user'),
  (current_setting('wp006.task_a2')::uuid,current_setting('wp006.user_a')::uuid,'A two','active','routine','flex','user'),
  (current_setting('wp006.task_b1')::uuid,current_setting('wp006.user_b')::uuid,'B private','active','normal','any','user');

set local role anon;
select throws_ok(
  $$select * from public.publish_daily_plan_v01('2026-08-28'::date,null,'[]'::jsonb,null,null,null)$$,
  '42501', null, 'anon cannot execute publication RPC'
);
reset role;

select set_config('request.jwt.claim.sub', current_setting('wp006.user_a'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select set_config(
  'wp006.plan1',
  (select plan_id::text from public.publish_daily_plan_v01(
    '2026-08-28'::date,
    null,
    jsonb_build_array(
      jsonb_build_object('task_id',current_setting('wp006.task_a1'),'bucket','must','position',0,'planned_minutes',45,'reason',null),
      jsonb_build_object('task_id',current_setting('wp006.task_a2'),'bucket','flex','position',0,'planned_minutes',null,'reason',null)
    ),
    180,
    '{"deep":90,"flex":90}'::jsonb,
    'Keep this brief'
  )),
  true
);

select results_eq(
  $$select revision from public.daily_plans where id=current_setting('wp006.plan1')::uuid$$,
  $$values (1)$$,
  'first publication creates revision 1'
);
select results_eq(
  $$select count(*)::bigint from public.daily_plans where user_id=current_setting('wp006.user_a')::uuid and plan_date='2026-08-28' and status='active'$$,
  $$values (1::bigint)$$,
  'first publication has exactly one active plan'
);
select results_eq(
  $$select count(*)::bigint from public.daily_plan_items where plan_id=current_setting('wp006.plan1')::uuid and current_state='planned' and carryover_from_item_id is null$$,
  $$values (2::bigint)$$,
  'new plan items are planned with no carryover'
);
select results_eq(
  $$select created_by from public.daily_plans where id=current_setting('wp006.plan1')::uuid$$,
  $$values ('user'::text)$$,
  'manual publication records created_by user'
);

select set_config(
  'wp006.plan2',
  (select plan_id::text from public.publish_daily_plan_v01(
    '2026-08-28'::date,
    current_setting('wp006.plan1')::uuid,
    jsonb_build_array(
      jsonb_build_object('task_id',current_setting('wp006.task_a2'),'bucket','should','position',0,'planned_minutes',30,'reason',null),
      jsonb_build_object('task_id',current_setting('wp006.task_a1'),'bucket','main_quest','position',0,'planned_minutes',60,'reason',null)
    ),
    null,
    null,
    null
  )),
  true
);

select results_eq(
  $$select revision from public.daily_plans where id=current_setting('wp006.plan2')::uuid$$,
  $$values (2)$$,
  'second publication creates revision 2'
);
select results_eq(
  $$select status from public.daily_plans where id=current_setting('wp006.plan1')::uuid$$,
  $$values ('superseded'::text)$$,
  'revision 1 becomes superseded'
);
select results_eq(
  $$select bucket from public.daily_plan_items where plan_id=current_setting('wp006.plan1')::uuid and task_id=current_setting('wp006.task_a1')::uuid$$,
  $$values ('must'::text)$$,
  'revision 1 items remain unchanged'
);
select results_eq(
  $$select capacity_minutes, capacity_breakdown, brief from public.daily_plans where id=current_setting('wp006.plan2')::uuid$$,
  $$values (180, '{"deep": 90, "flex": 90}'::jsonb, 'Keep this brief'::text)$$,
  'new revision preserves unedited plan metadata'
);
select results_eq(
  $$select count(*)::bigint from public.daily_plans where user_id=current_setting('wp006.user_a')::uuid and plan_date='2026-08-28' and status='active'$$,
  $$values (1::bigint)$$,
  'second publication still has exactly one active plan'
);

select throws_ok(
  $$select * from public.publish_daily_plan_v01('2026-08-28'::date,current_setting('wp006.plan2')::uuid,jsonb_build_array(jsonb_build_object('task_id',current_setting('wp006.task_a1'),'bucket','must','position',0),jsonb_build_object('task_id',current_setting('wp006.task_a1'),'bucket','should','position',0)),null,null,null)$$,
  'P0001', 'Duplicate task in daily plan.', 'duplicate task rejected'
);
select results_eq(
  $$select id from public.daily_plans where user_id=current_setting('wp006.user_a')::uuid and plan_date='2026-08-28' and status='active'$$,
  $$select current_setting('wp006.plan2')::uuid$$,
  'failed duplicate publish leaves previous active plan intact'
);

select throws_ok(
  $$select * from public.publish_daily_plan_v01('2026-08-28'::date,current_setting('wp006.plan1')::uuid,'[]'::jsonb,null,null,null)$$,
  'P0001', 'Daily plan changed. Refresh before publishing again.', 'stale base plan rejected'
);

select throws_ok(
  $$select * from public.publish_daily_plan_v01('2026-08-28'::date,current_setting('wp006.plan2')::uuid,jsonb_build_array(jsonb_build_object('task_id',current_setting('wp006.task_b1'),'bucket','must','position',0)),null,null,null)$$,
  'P0001', 'One or more tasks are unavailable for this user.', 'cross-owner task rejected'
);
select results_eq(
  $$select id from public.daily_plans where user_id=current_setting('wp006.user_a')::uuid and plan_date='2026-08-28' and status='active'$$,
  $$select current_setting('wp006.plan2')::uuid$$,
  'cross-owner failure rolls back without destroying active plan'
);

update public.daily_plan_items
set current_state='started'
where plan_id=current_setting('wp006.plan2')::uuid
  and task_id=current_setting('wp006.task_a1')::uuid;

select throws_ok(
  $$select * from public.publish_daily_plan_v01('2026-08-28'::date,current_setting('wp006.plan2')::uuid,'[]'::jsonb,null,null,null)$$,
  'P0001', 'Execution has started; replanning is not supported by this stage.', 'execution-started plan cannot be simple-republished'
);
select results_eq(
  $$select id from public.daily_plans where user_id=current_setting('wp006.user_a')::uuid and plan_date='2026-08-28' and status='active'$$,
  $$select current_setting('wp006.plan2')::uuid$$,
  'execution guard leaves active plan intact'
);

select throws_ok(
  $$select * from public.publish_daily_plan_v01('2026-08-29'::date,null,jsonb_build_array(jsonb_build_object('task_id',current_setting('wp006.task_a1'),'bucket','must','position',0),jsonb_build_object('task_id',current_setting('wp006.task_a2'),'bucket','must','position',0)),null,null,null)$$,
  'P0001', 'Duplicate bucket position in daily plan.', 'duplicate bucket position rejected'
);

reset role;
select * from finish();
rollback;
