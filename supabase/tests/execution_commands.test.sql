begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(43);

select results_eq(
  $$select count(*)::bigint from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_task_action_v01'$$,
  $$values (1::bigint)$$,
  'execution RPC exists exactly once'
);
select results_eq(
  $$select not p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_task_action_v01'$$,
  $$values (true)$$,
  'execution RPC is SECURITY INVOKER'
);
select results_eq(
  $$select coalesce(array_to_string(p.proconfig,','),'')='search_path=""' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_task_action_v01'$$,
  $$values (true)$$,
  'execution RPC pins an empty search_path'
);
select results_eq(
  $$select count(*)::bigint from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='record_task_action_v01' and a.grantee=0 and a.privilege_type='EXECUTE'$$,
  $$values (0::bigint)$$,
  'execution RPC denies PUBLIC execute'
);
select ok(not has_function_privilege('anon','public.record_task_action_v01(uuid,uuid,text,timestamptz,numeric,integer,integer,text,text)','EXECUTE'),'anon cannot execute execution RPC');
select ok(not has_function_privilege('service_role','public.record_task_action_v01(uuid,uuid,text,timestamptz,numeric,integer,integer,text,text)','EXECUTE'),'service_role is not granted execution RPC');
select ok(has_function_privilege('authenticated','public.record_task_action_v01(uuid,uuid,text,timestamptz,numeric,integer,integer,text,text)','EXECUTE'),'authenticated can execute execution RPC');

select results_eq(
  $$select count(*)::bigint from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='add_plan_item_feedback_v01'$$,
  $$values (1::bigint)$$,
  'feedback RPC exists exactly once'
);
select results_eq(
  $$select (not p.prosecdef) and coalesce(array_to_string(p.proconfig,','),'')='search_path=""' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='add_plan_item_feedback_v01'$$,
  $$values (true)$$,
  'feedback RPC is invoker with empty search_path'
);
select ok(not has_function_privilege('anon','public.add_plan_item_feedback_v01(uuid,uuid,text)','EXECUTE'),'anon cannot execute feedback RPC');
select ok(not has_function_privilege('service_role','public.add_plan_item_feedback_v01(uuid,uuid,text)','EXECUTE'),'service_role is not granted feedback RPC');
select ok(has_function_privilege('authenticated','public.add_plan_item_feedback_v01(uuid,uuid,text)','EXECUTE'),'authenticated can execute feedback RPC');

select results_eq(
  $$select count(*)::bigint from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgname in ('taskring_guard_task_events_insert','taskring_guard_daily_plans_mutation','taskring_guard_daily_plan_items_mutation','taskring_guard_user_feedback_insert','taskring_guard_tasks_execution_projection')$$,
  $$values (5::bigint)$$,
  'five domain mutation guard triggers exist'
);
select ok(not has_table_privilege('authenticated','public.daily_plans','DELETE'),'authenticated cannot delete Daily Plan history');
select ok(not has_table_privilege('authenticated','public.daily_plan_items','DELETE'),'authenticated cannot delete Daily Plan Item history');
select ok(not has_table_privilege('authenticated','public.user_feedback','UPDATE'),'authenticated cannot rewrite feedback');
select ok(not has_table_privilege('authenticated','public.user_feedback','DELETE'),'authenticated cannot delete feedback');

select set_config('wp007.user_a',gen_random_uuid()::text,true);
select set_config('wp007.user_b',gen_random_uuid()::text,true);
select set_config('wp007.task_a1',gen_random_uuid()::text,true);
select set_config('wp007.task_a2',gen_random_uuid()::text,true);
select set_config('wp007.task_a3',gen_random_uuid()::text,true);
select set_config('wp007.task_a4',gen_random_uuid()::text,true);
select set_config('wp007.task_a5',gen_random_uuid()::text,true);
select set_config('wp007.task_b1',gen_random_uuid()::text,true);

insert into auth.users(id,email) values
  (current_setting('wp007.user_a')::uuid,'wp007-a@example.invalid'),
  (current_setting('wp007.user_b')::uuid,'wp007-b@example.invalid');
insert into public.tasks(id,user_id,title,status,task_kind,execution_context,created_by,remaining_minutes) values
  (current_setting('wp007.task_a1')::uuid,current_setting('wp007.user_a')::uuid,'A done','active','normal','any','user',50),
  (current_setting('wp007.task_a2')::uuid,current_setting('wp007.user_a')::uuid,'A partial','active','normal','any','user',60),
  (current_setting('wp007.task_a3')::uuid,current_setting('wp007.user_a')::uuid,'A skip','active','normal','any','user',20),
  (current_setting('wp007.task_a4')::uuid,current_setting('wp007.user_a')::uuid,'A defer','active','normal','any','user',30),
  (current_setting('wp007.task_a5')::uuid,current_setting('wp007.user_a')::uuid,'A cancel','active','normal','any','user',40),
  (current_setting('wp007.task_b1')::uuid,current_setting('wp007.user_b')::uuid,'B private','active','normal','any','user',10);

select set_config('request.jwt.claim.sub',current_setting('wp007.user_a'),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select set_config(
  'wp007.plan_a',
  (select plan_id::text from public.publish_daily_plan_v01(
    '2026-08-28'::date,
    null,
    jsonb_build_array(
      jsonb_build_object('task_id',current_setting('wp007.task_a1'),'bucket','must','position',0),
      jsonb_build_object('task_id',current_setting('wp007.task_a2'),'bucket','should','position',0),
      jsonb_build_object('task_id',current_setting('wp007.task_a3'),'bucket','flex','position',0),
      jsonb_build_object('task_id',current_setting('wp007.task_a4'),'bucket','routine','position',0),
      jsonb_build_object('task_id',current_setting('wp007.task_a5'),'bucket','bonus','position',0)
    ),null,null,null
  )),true
);
select set_config('wp007.item_a1',(select id::text from public.daily_plan_items where plan_id=current_setting('wp007.plan_a')::uuid and task_id=current_setting('wp007.task_a1')::uuid),true);
select set_config('wp007.item_a2',(select id::text from public.daily_plan_items where plan_id=current_setting('wp007.plan_a')::uuid and task_id=current_setting('wp007.task_a2')::uuid),true);
select set_config('wp007.item_a3',(select id::text from public.daily_plan_items where plan_id=current_setting('wp007.plan_a')::uuid and task_id=current_setting('wp007.task_a3')::uuid),true);
select set_config('wp007.item_a4',(select id::text from public.daily_plan_items where plan_id=current_setting('wp007.plan_a')::uuid and task_id=current_setting('wp007.task_a4')::uuid),true);
select set_config('wp007.item_a5',(select id::text from public.daily_plan_items where plan_id=current_setting('wp007.plan_a')::uuid and task_id=current_setting('wp007.task_a5')::uuid),true);

select throws_ok(
  $$insert into public.task_events(id,user_id,task_id,plan_item_id,event_type,occurred_at,actor) values(gen_random_uuid(),current_setting('wp007.user_a')::uuid,current_setting('wp007.task_a1')::uuid,current_setting('wp007.item_a1')::uuid,'started',now(),'user')$$,
  'P0001','Execution mutations must use record_task_action_v01.','direct authenticated event insert is guarded'
);
select throws_ok(
  $$update public.daily_plan_items set current_state='done' where id=current_setting('wp007.item_a1')::uuid$$,
  'P0001','Daily Plan Item mutations must use an approved command boundary.','direct execution-state bypass is guarded'
);
select throws_ok(
  $$update public.tasks set status='done' where id=current_setting('wp007.task_a1')::uuid$$,
  'P0001','Execution projections must use record_task_action_v01.','direct Task done projection is guarded'
);

select set_config('wp007.event_done',gen_random_uuid()::text,true);
select lives_ok(
  $$select * from public.record_task_action_v01(current_setting('wp007.event_done')::uuid,current_setting('wp007.item_a1')::uuid,'done','2026-08-28T09:00:00Z',null,null,45,null,'finished')$$,
  'Done action succeeds through command RPC'
);
select results_eq(
  $$select count(*)::bigint from public.task_events where id=current_setting('wp007.event_done')::uuid and user_id=current_setting('wp007.user_a')::uuid and task_id=current_setting('wp007.task_a1')::uuid and plan_item_id=current_setting('wp007.item_a1')::uuid and event_type='done' and actor='user' and metadata='{}'::jsonb$$,
  $$values (1::bigint)$$,
  'Done appends one derived immutable user Event'
);
select results_eq(
  $$select current_state from public.daily_plan_items where id=current_setting('wp007.item_a1')::uuid$$,
  $$values ('done'::text)$$,
  'Done projects item to done'
);
select results_eq(
  $$select status,remaining_minutes,completed_at from public.tasks where id=current_setting('wp007.task_a1')::uuid$$,
  $$values ('done'::text,0,'2026-08-28T09:00:00Z'::timestamptz)$$,
  'Done atomically projects Task done, zero remaining, completed_at'
);
select lives_ok(
  $$select * from public.record_task_action_v01(current_setting('wp007.event_done')::uuid,current_setting('wp007.item_a1')::uuid,'done','2026-08-28T10:00:00Z',null,null,45,null,'finished')$$,
  'same idempotent Done command can be retried safely'
);
select results_eq(
  $$select count(*)::bigint from public.task_events where id=current_setting('wp007.event_done')::uuid$$,
  $$values (1::bigint)$$,
  'idempotent retry keeps exactly one Event'
);
select throws_ok(
  $$select * from public.record_task_action_v01(current_setting('wp007.event_done')::uuid,current_setting('wp007.item_a1')::uuid,'reopened',now(),null,null,null,null,null)$$,
  'P0001','Idempotency conflict.','same Event ID with a different command is rejected'
);
select throws_ok(
  $$select * from public.record_task_action_v01(gen_random_uuid(),current_setting('wp007.item_a1')::uuid,'partial',now(),50,10,null,null,null)$$,
  'P0001','Task is no longer executable.','terminal Task cannot accept Partial without Reopen'
);
select results_eq(
  $$select count(*)::bigint from public.task_events where plan_item_id=current_setting('wp007.item_a1')::uuid$$,
  $$values (1::bigint)$$,
  'invalid transition creates no Event'
);

select lives_ok(
  $$select * from public.record_task_action_v01(gen_random_uuid(),current_setting('wp007.item_a1')::uuid,'reopened',now(),null,null,null,null,'undo')$$,
  'Reopen appends history instead of deleting Done'
);
select results_eq(
  $$select dpi.current_state,t.status,t.completed_at is null,(select count(*)::bigint from public.task_events te where te.plan_item_id=dpi.id) from public.daily_plan_items dpi join public.tasks t on t.id=dpi.task_id and t.user_id=dpi.user_id where dpi.id=current_setting('wp007.item_a1')::uuid$$,
  $$values ('started'::text,'active'::text,true,2::bigint)$$,
  'Reopen projects item started, Task active, and preserves two Events'
);
select lives_ok(
  $$select * from public.record_task_action_v01(gen_random_uuid(),current_setting('wp007.item_a1')::uuid,'blocked',now(),null,null,null,'dependency',null)$$,
  'Blocked succeeds from started'
);
select results_eq(
  $$select dpi.current_state,t.status from public.daily_plan_items dpi join public.tasks t on t.id=dpi.task_id and t.user_id=dpi.user_id where dpi.id=current_setting('wp007.item_a1')::uuid$$,
  $$values ('blocked'::text,'blocked'::text)$$,
  'Blocked atomically projects item and Task blocked'
);

select lives_ok(
  $$select * from public.record_task_action_v01(gen_random_uuid(),current_setting('wp007.item_a2')::uuid,'partial',now(),40,25,20,null,'progress')$$,
  'Partial accepts progress or remaining detail'
);
select results_eq(
  $$select dpi.current_state,t.remaining_minutes,(select count(*)::bigint from public.task_events te where te.plan_item_id=dpi.id and te.event_type='partial' and te.progress_percent=40 and te.remaining_minutes=25 and te.actual_minutes=20) from public.daily_plan_items dpi join public.tasks t on t.id=dpi.task_id and t.user_id=dpi.user_id where dpi.id=current_setting('wp007.item_a2')::uuid$$,
  $$values ('partial'::text,25,1::bigint)$$,
  'Partial atomically records Event and remaining projection'
);
select throws_ok(
  $$select * from public.record_task_action_v01(gen_random_uuid(),current_setting('wp007.item_a2')::uuid,'partial',now(),100,null,null,null,null)$$,
  'P0001','Partial progress must be greater than 0 and less than 100.','Partial rejects 100 percent'
);

select lives_ok($$select * from public.record_task_action_v01(gen_random_uuid(),current_setting('wp007.item_a3')::uuid,'skipped',now(),null,null,null,'not today',null)$$,'Skip Today succeeds');
select results_eq($$select current_state from public.daily_plan_items where id=current_setting('wp007.item_a3')::uuid$$,$$values ('skipped'::text)$$,'Skip Today changes only item projection');
select lives_ok($$select * from public.record_task_action_v01(gen_random_uuid(),current_setting('wp007.item_a4')::uuid,'deferred',now(),null,null,null,'later',null)$$,'Defer succeeds');
select results_eq($$select current_state from public.daily_plan_items where id=current_setting('wp007.item_a4')::uuid$$,$$values ('deferred'::text)$$,'Defer projects item deferred without tomorrow planning');
select lives_ok($$select * from public.record_task_action_v01(gen_random_uuid(),current_setting('wp007.item_a5')::uuid,'cancelled',now(),null,null,null,'cancel',null)$$,'Cancel succeeds');
select results_eq($$select dpi.current_state,t.status from public.daily_plan_items dpi join public.tasks t on t.id=dpi.task_id and t.user_id=dpi.user_id where dpi.id=current_setting('wp007.item_a5')::uuid$$,$$values ('cancelled'::text,'cancelled'::text)$$,'Cancel atomically projects item and Task cancelled');

create or replace function public.wp007_force_event_failure()
returns trigger language plpgsql set search_path='' as $$ begin
  if new.reason='force-failure' then raise exception using errcode='P0001',message='forced event failure'; end if;
  return new;
end $$;
create trigger zz_wp007_force_event_failure before insert on public.task_events for each row execute function public.wp007_force_event_failure();
select throws_ok(
  $$select * from public.record_task_action_v01(gen_random_uuid(),current_setting('wp007.item_a3')::uuid,'reopened',now(),null,null,null,'force-failure',null)$$,
  'P0001','forced event failure','event insertion failure aborts the command'
);
select results_eq(
  $$select current_state from public.daily_plan_items where id=current_setting('wp007.item_a3')::uuid$$,
  $$values ('skipped'::text)$$,
  'event insertion failure rolls back item projection'
);
drop trigger zz_wp007_force_event_failure on public.task_events;
drop function public.wp007_force_event_failure();

select set_config('wp007.feedback',gen_random_uuid()::text,true);
select lives_ok(
  $$select * from public.add_plan_item_feedback_v01(current_setting('wp007.feedback')::uuid,current_setting('wp007.item_a2')::uuid,' Felt harder than expected ')$$,
  'own feedback succeeds through feedback RPC'
);
select results_eq(
  $$select user_id,task_id,plan_id,plan_item_id,content,source,ai_interpretation from public.user_feedback where id=current_setting('wp007.feedback')::uuid$$,
  $$values (current_setting('wp007.user_a')::uuid,current_setting('wp007.task_a2')::uuid,current_setting('wp007.plan_a')::uuid,current_setting('wp007.item_a2')::uuid,'Felt harder than expected'::text,'frontend'::text,null::jsonb)$$,
  'feedback ownership/references/source are server-derived and AI interpretation is null'
);
select lives_ok(
  $$select * from public.add_plan_item_feedback_v01(current_setting('wp007.feedback')::uuid,current_setting('wp007.item_a2')::uuid,'Felt harder than expected')$$,
  'same feedback ID and payload retries safely'
);
select results_eq($$select count(*)::bigint from public.user_feedback where id=current_setting('wp007.feedback')::uuid$$,$$values (1::bigint)$$,'feedback retry remains one row');
select throws_ok(
  $$select * from public.add_plan_item_feedback_v01(current_setting('wp007.feedback')::uuid,current_setting('wp007.item_a2')::uuid,'Different content')$$,
  'P0001','Idempotency conflict.','feedback ID reuse with different payload is rejected'
);
select throws_ok(
  $$select * from public.add_plan_item_feedback_v01(gen_random_uuid(),current_setting('wp007.item_a2')::uuid,'   ')$$,
  'P0001','Feedback content is required.','empty feedback is rejected'
);
select throws_ok(
  $$insert into public.user_feedback(id,user_id,task_id,plan_id,plan_item_id,content,source) values(gen_random_uuid(),current_setting('wp007.user_a')::uuid,current_setting('wp007.task_a2')::uuid,current_setting('wp007.plan_a')::uuid,current_setting('wp007.item_a2')::uuid,'bypass','frontend')$$,
  'P0001','Feedback mutations must use add_plan_item_feedback_v01.','direct feedback insert is guarded'
);

reset role;
select set_config('taskring.command_context','execution:v1',true);
update public.daily_plan_items set current_state='planned' where id=current_setting('wp007.item_a1')::uuid;
select set_config('taskring.command_context','',true);
select set_config('request.jwt.claim.sub',current_setting('wp007.user_a'),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select throws_ok(
  $$select * from public.publish_daily_plan_v01('2026-08-28'::date,current_setting('wp007.plan_a')::uuid,'[]'::jsonb,null,null,null)$$,
  'P0001','Execution has started; replanning is not supported by this stage.','execution Event history blocks WP006 simple replanning even if projection is reset'
);

reset role;
select * from finish();
rollback;
