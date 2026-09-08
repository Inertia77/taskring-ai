-- Compatible command extension: serialize publication/replanning/execution per owner.
create or replace function public.publish_daily_plan_v01(
  p_plan_date date,
  p_base_plan_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_capacity_minutes integer default null,
  p_capacity_breakdown jsonb default null,
  p_brief text default null
)
returns table(plan_id uuid, revision integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.daily_plans%rowtype;
  v_has_current boolean := false;
  v_new_plan_id uuid;
  v_next_revision integer;
  v_capacity_minutes integer;
  v_capacity_breakdown jsonb;
  v_brief text;
  v_item jsonb;
  v_task_id uuid;
  v_bucket text;
  v_position integer;
  v_planned_minutes integer;
  v_reason text;
  v_seen_task_ids uuid[] := array[]::uuid[];
  v_seen_positions text[] := array[]::text[];
  v_position_key text;
  v_previous_context text := pg_catalog.current_setting('taskring.command_context', true);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if p_plan_date is null then
    raise exception using errcode = 'P0001', message = 'Plan date is required.';
  end if;

  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'P0001', message = 'Items must be a JSON array.';
  end if;

  if p_capacity_minutes is not null and p_capacity_minutes < 0 then
    raise exception using errcode = 'P0001', message = 'Capacity minutes must be zero or greater.';
  end if;

  if p_capacity_breakdown is not null and pg_catalog.jsonb_typeof(p_capacity_breakdown) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Capacity breakdown must be a JSON object.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 12));

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_plan_date::text, 0)
  );

  select *
  into v_current
  from public.daily_plans
  where user_id = v_user_id
    and plan_date = p_plan_date
    and status = 'active'
  for update;

  v_has_current := found;

  if v_has_current then
    if p_base_plan_id is distinct from v_current.id then
      raise exception using errcode = 'P0001', message = 'Daily plan changed. Refresh before publishing again.';
    end if;

    if exists (
      select 1
      from public.daily_plan_items as dpi
      where dpi.user_id = v_user_id
        and dpi.plan_id = v_current.id
        and (
          dpi.current_state <> 'planned'
          or exists (
            select 1
            from public.task_events as te
            where te.user_id = v_user_id
              and te.plan_item_id = dpi.id
          )
        )
    ) then
      raise exception using errcode = 'P0001', message = 'Execution has started; replanning is not supported by this stage.';
    end if;
  elsif p_base_plan_id is not null then
    raise exception using errcode = 'P0001', message = 'Daily plan changed. Refresh before publishing again.';
  end if;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(p_items) as items(value)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = 'P0001', message = 'Invalid daily plan item.';
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_item) as keys(key)
      where keys.key not in ('task_id', 'bucket', 'position', 'planned_minutes', 'reason')
    ) then
      raise exception using errcode = 'P0001', message = 'Invalid daily plan item fields.';
    end if;

    begin
      v_task_id := nullif(v_item ->> 'task_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'Invalid daily plan item task.';
    end;
    if v_task_id is null then
      raise exception using errcode = 'P0001', message = 'Invalid daily plan item task.';
    end if;

    v_bucket := v_item ->> 'bucket';
    if v_bucket is null or v_bucket not in ('must', 'should', 'main_quest', 'flex', 'routine', 'game', 'bonus') then
      raise exception using errcode = 'P0001', message = 'Invalid daily plan item bucket.';
    end if;

    if pg_catalog.jsonb_typeof(v_item -> 'position') <> 'number'
       or (v_item ->> 'position') !~ '^[0-9]+$' then
      raise exception using errcode = 'P0001', message = 'Invalid daily plan item position.';
    end if;
    v_position := (v_item ->> 'position')::integer;

    if v_item ? 'planned_minutes' and v_item -> 'planned_minutes' <> 'null'::jsonb then
      if pg_catalog.jsonb_typeof(v_item -> 'planned_minutes') <> 'number'
         or (v_item ->> 'planned_minutes') !~ '^[0-9]+$' then
        raise exception using errcode = 'P0001', message = 'Invalid daily plan item planned minutes.';
      end if;
      v_planned_minutes := (v_item ->> 'planned_minutes')::integer;
    else
      v_planned_minutes := null;
    end if;

    if v_item ? 'reason' and v_item -> 'reason' <> 'null'::jsonb then
      if pg_catalog.jsonb_typeof(v_item -> 'reason') <> 'string' then
        raise exception using errcode = 'P0001', message = 'Invalid daily plan item reason.';
      end if;
      v_reason := v_item ->> 'reason';
    else
      v_reason := null;
    end if;

    if v_task_id = any(v_seen_task_ids) then
      raise exception using errcode = 'P0001', message = 'Duplicate task in daily plan.';
    end if;
    v_seen_task_ids := pg_catalog.array_append(v_seen_task_ids, v_task_id);

    v_position_key := v_bucket || ':' || v_position::text;
    if v_position_key = any(v_seen_positions) then
      raise exception using errcode = 'P0001', message = 'Duplicate bucket position in daily plan.';
    end if;
    v_seen_positions := pg_catalog.array_append(v_seen_positions, v_position_key);

    perform 1
    from public.tasks
    where id = v_task_id
      and user_id = v_user_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'One or more tasks are unavailable for this user.';
    end if;
  end loop;

  select coalesce(pg_catalog.max(dp.revision), 0) + 1
  into v_next_revision
  from public.daily_plans as dp
  where dp.user_id = v_user_id
    and dp.plan_date = p_plan_date;

  if v_has_current then
    v_capacity_minutes := coalesce(p_capacity_minutes, v_current.capacity_minutes);
    v_capacity_breakdown := coalesce(p_capacity_breakdown, v_current.capacity_breakdown);
    v_brief := coalesce(p_brief, v_current.brief);
  else
    v_capacity_minutes := p_capacity_minutes;
    v_capacity_breakdown := coalesce(p_capacity_breakdown, '{}'::jsonb);
    v_brief := p_brief;
  end if;

  perform pg_catalog.set_config('taskring.command_context', 'publication:v1', true);

  if v_has_current then
    update public.daily_plans
    set status = 'superseded'
    where id = v_current.id
      and user_id = v_user_id;
  end if;

  insert into public.daily_plans (
    user_id, plan_date, revision, status, capacity_minutes,
    capacity_breakdown, brief, created_by
  ) values (
    v_user_id, p_plan_date, v_next_revision, 'active', v_capacity_minutes,
    v_capacity_breakdown, v_brief, 'user'
  )
  returning id into v_new_plan_id;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(p_items) as items(value)
  loop
    insert into public.daily_plan_items (
      user_id, plan_id, task_id, bucket, position, planned_minutes,
      reason, carryover_from_item_id, current_state
    ) values (
      v_user_id,
      v_new_plan_id,
      (v_item ->> 'task_id')::uuid,
      v_item ->> 'bucket',
      (v_item ->> 'position')::integer,
      case when v_item -> 'planned_minutes' = 'null'::jsonb or not (v_item ? 'planned_minutes') then null else (v_item ->> 'planned_minutes')::integer end,
      case when v_item -> 'reason' = 'null'::jsonb or not (v_item ? 'reason') then null else v_item ->> 'reason' end,
      null,
      'planned'
    );
  end loop;

  perform pg_catalog.set_config('taskring.command_context', coalesce(v_previous_context, ''), true);
  return query select v_new_plan_id, v_next_revision;
end;
$$;

create or replace function public.record_task_action_v01(
  p_event_id uuid,
  p_plan_item_id uuid,
  p_expected_state text,
  p_action text,
  p_occurred_at timestamptz default now(),
  p_progress_percent numeric default null,
  p_remaining_minutes integer default null,
  p_actual_minutes integer default null,
  p_reason text default null,
  p_note text default null
)
returns table(event_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.daily_plan_items%rowtype;
  v_task public.tasks%rowtype;
  v_existing public.task_events%rowtype;
  v_target_state text;
  v_occurred_at timestamptz := coalesce(p_occurred_at, pg_catalog.clock_timestamp());
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_previous_context text := pg_catalog.current_setting('taskring.command_context', true);
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required.'; end if;
  if p_event_id is null or p_plan_item_id is null then raise exception using errcode='P0001', message='Event ID and Plan Item are required.'; end if;
  if p_expected_state is null or p_expected_state not in ('planned','started','partial','done','skipped','deferred','blocked','cancelled') then
    raise exception using errcode='P0001', message='Expected execution state is required.';
  end if;
  if p_action not in ('started','partial','done','skipped','deferred','blocked','cancelled','reopened') then
    raise exception using errcode='P0001', message='Unsupported task action.';
  end if;
  if p_progress_percent is not null and (p_progress_percent <= 0 or p_progress_percent >= 100) then
    raise exception using errcode='P0001', message='Partial progress must be greater than 0 and less than 100.';
  end if;
  if p_remaining_minutes is not null and p_remaining_minutes < 0 then raise exception using errcode='P0001', message='Remaining minutes must be zero or greater.'; end if;
  if p_actual_minutes is not null and p_actual_minutes < 0 then raise exception using errcode='P0001', message='Actual minutes must be zero or greater.'; end if;
  if p_action='partial' and p_progress_percent is null and p_remaining_minutes is null then
    raise exception using errcode='P0001', message='Partial requires progress percent or remaining minutes.';
  end if;
  if p_action<>'partial' and (p_progress_percent is not null or p_remaining_minutes is not null) then
    raise exception using errcode='P0001', message='Progress and remaining minutes are only valid for Partial.';
  end if;
  if p_actual_minutes is not null and p_action not in ('partial','done') then
    raise exception using errcode='P0001', message='Actual minutes are only valid for Partial or Done.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 12));

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_id::text, 7));

  select * into v_existing from public.task_events where id=p_event_id and user_id=v_user_id;
  if found then
    if v_existing.plan_item_id is not distinct from p_plan_item_id
       and v_existing.event_type=p_action
       and v_existing.progress_percent is not distinct from p_progress_percent
       and v_existing.remaining_minutes is not distinct from p_remaining_minutes
       and v_existing.actual_minutes is not distinct from p_actual_minutes
       and v_existing.reason is not distinct from v_reason
       and v_existing.note is not distinct from v_note then
      return query select v_existing.id;
      return;
    end if;
    raise exception using errcode='P0001', message='Idempotency conflict.';
  end if;

  select dpi.* into v_item
  from public.daily_plan_items dpi
  join public.daily_plans dp on dp.id=dpi.plan_id and dp.user_id=dpi.user_id
  where dpi.id=p_plan_item_id and dpi.user_id=v_user_id and dp.status='active'
  for update of dpi;
  if not found then raise exception using errcode='P0001', message='Plan Item is unavailable.'; end if;

  if v_item.current_state <> p_expected_state then
    raise exception using errcode='P0001', message='Execution state changed. Refresh before retrying.';
  end if;

  select * into v_task from public.tasks where id=v_item.task_id and user_id=v_user_id for update;
  if not found then raise exception using errcode='P0001', message='Task is unavailable.'; end if;
  if p_action <> 'reopened' and v_task.status in ('done','cancelled') then
    raise exception using errcode='P0001', message='Task is no longer executable.';
  end if;

  if not (
    (v_item.current_state='planned' and p_action in ('started','partial','done','skipped','deferred','blocked','cancelled'))
    or (v_item.current_state='started' and p_action in ('partial','done','skipped','deferred','blocked','cancelled'))
    or (v_item.current_state='partial' and p_action in ('partial','done','deferred','blocked','cancelled'))
    or (v_item.current_state='blocked' and p_action in ('done','deferred','cancelled','reopened'))
    or (v_item.current_state in ('done','skipped','deferred','cancelled') and p_action='reopened')
  ) then
    raise exception using errcode='P0001', message='Invalid execution state transition.';
  end if;

  v_target_state := case p_action when 'reopened' then 'started' else p_action end;
  perform pg_catalog.set_config('taskring.command_context','execution:v1',true);

  insert into public.task_events(
    id,user_id,task_id,plan_item_id,event_type,occurred_at,
    progress_percent,remaining_minutes,actual_minutes,reason,note,actor,metadata
  ) values (
    p_event_id,v_user_id,v_item.task_id,v_item.id,p_action,v_occurred_at,
    p_progress_percent,p_remaining_minutes,p_actual_minutes,v_reason,v_note,'user','{}'::jsonb
  );

  update public.daily_plan_items
  set current_state=v_target_state, updated_at=pg_catalog.clock_timestamp()
  where id=v_item.id and user_id=v_user_id;

  if p_action='partial' and p_remaining_minutes is not null then
    update public.tasks set remaining_minutes=p_remaining_minutes where id=v_task.id and user_id=v_user_id;
  elsif p_action='done' then
    update public.tasks set status='done',completed_at=v_occurred_at,remaining_minutes=0 where id=v_task.id and user_id=v_user_id;
  elsif p_action='blocked' then
    update public.tasks set status='blocked' where id=v_task.id and user_id=v_user_id;
  elsif p_action='cancelled' then
    update public.tasks set status='cancelled' where id=v_task.id and user_id=v_user_id;
  elsif p_action='reopened' then
    update public.tasks set status='active',completed_at=null where id=v_task.id and user_id=v_user_id;
  end if;

  perform pg_catalog.set_config('taskring.command_context', coalesce(v_previous_context, ''), true);
  return query select p_event_id;
end;
$$;

create function public.replan_daily_plan_v01(p_request jsonb)
returns table(plan_id uuid, revision integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_date date;
  v_base uuid;
  v_current public.daily_plans%rowtype;
  v_plan uuid;
  v_revision integer;
  v_item jsonb;
  v_decision jsonb;
  v_source public.daily_plan_items%rowtype;
  v_task public.tasks%rowtype;
  v_ids uuid[] := array[]::uuid[];
  v_sources uuid[] := array[]::uuid[];
  v_index integer := 0;
  v_previous text := pg_catalog.current_setting('taskring.command_context',true);
  v_expected jsonb;
  v_actual jsonb;
  v_task_id uuid;
begin
  if v_user is null then raise exception using errcode='42501',message='Authentication required.'; end if;
  if p_request is null or pg_catalog.jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode='P0001',message='Invalid replan request.';
  end if;
  v_date := (p_request->>'plan_date')::date;
  v_base := (p_request->>'base_plan_id')::uuid;
  if v_date is null or pg_catalog.jsonb_typeof(p_request->'items') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_request->'decisions') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_request->'expected_items') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_request->'expected_tasks') is distinct from 'array'
     or coalesce(pg_catalog.btrim(p_request->>'brief'),'')=''
     or coalesce((p_request->>'capacity_minutes')::integer,-1)<0
     or pg_catalog.jsonb_array_length(p_request->'items')>100 then
    raise exception using errcode='P0001',message='Invalid replan contract.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,12));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text||':'||v_date::text,0));
  select * into v_current from public.daily_plans where user_id=v_user and plan_date=v_date and status='active' for update;
  if v_current.id is distinct from v_base then raise exception using errcode='P0001',message='Plan changed.'; end if;
  perform 1 from public.daily_plan_items where user_id=v_user and plan_id=v_base order by id for update;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'current_state',current_state,'updated_at',updated_at) order by id),'[]'::jsonb)
    into v_actual from public.daily_plan_items where user_id=v_user and plan_id=v_base;
  select coalesce(pg_catalog.jsonb_agg(x order by x->>'id'),'[]'::jsonb) into v_expected from pg_catalog.jsonb_array_elements(p_request->'expected_items') x;
  if v_actual is distinct from v_expected then raise exception using errcode='P0001',message='Execution changed.'; end if;

  -- Every referenced historical source must belong to the caller and same task.
  -- Every unfinished base item requires exactly one explicit decision.
  for v_decision in select value from pg_catalog.jsonb_array_elements(p_request->'decisions') loop
    if coalesce(v_decision->>'decision','') not in ('carry','omit') or coalesce(pg_catalog.btrim(v_decision->>'reason'),'')='' then
      raise exception using errcode='P0001',message='Carryover requires a decision and reason.';
    end if;
    select * into v_source from public.daily_plan_items where id=(v_decision->>'source_item_id')::uuid and user_id=v_user for update;
    if not found or v_source.id=any(v_sources) or v_source.current_state in ('done','cancelled') then
      raise exception using errcode='P0001',message='Carryover source unavailable.';
    end if;
    if not exists(select 1 from public.daily_plans where id=v_source.plan_id and user_id=v_user and plan_date<=v_date) then
      raise exception using errcode='P0001',message='Future carryover source unavailable.';
    end if;
    v_sources:=pg_catalog.array_append(v_sources,v_source.id);
    if (v_decision->>'decision'='carry') is distinct from exists(select 1 from pg_catalog.jsonb_array_elements(p_request->'items') x where (x->>'task_id')::uuid=v_source.task_id) then
      raise exception using errcode='P0001',message='Carryover decision and selected task disagree.';
    end if;
  end loop;
  if exists(select 1 from public.daily_plan_items where user_id=v_user and plan_id=v_base and current_state not in ('done','cancelled') and not(id=any(v_sources))) then
    raise exception using errcode='P0001',message='Every unfinished base item requires a decision.';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_request->'items') loop
    v_task_id:=(v_item->>'task_id')::uuid;
    select * into v_task from public.tasks where id=v_task_id and user_id=v_user for update;
    if not found or v_task.status<>'active' or v_task_id=any(v_ids) then raise exception using errcode='P0001',message='Task unavailable or duplicated.'; end if;
    if not exists(select 1 from pg_catalog.jsonb_array_elements(p_request->'expected_tasks') x where (x->>'id')::uuid=v_task.id and (x->>'updated_at')::timestamptz=v_task.updated_at) then
      raise exception using errcode='P0001',message='Task changed.';
    end if;
    v_ids:=pg_catalog.array_append(v_ids,v_task_id);
    if coalesce((v_item->>'planned_minutes')::integer,0)<=0 or coalesce(pg_catalog.btrim(v_item->>'reason'),'')='' then
      raise exception using errcode='P0001',message='Effort and rationale required.';
    end if;
    if (select count(*) from pg_catalog.jsonb_array_elements(p_request->'decisions') d join public.daily_plan_items dpi on dpi.id=(d->>'source_item_id')::uuid and dpi.user_id=v_user where d->>'decision'='carry' and dpi.task_id=v_task_id)>1 then
      raise exception using errcode='P0001',message='Only one carryover source per task.';
    end if;
  end loop;
  if (select coalesce(sum((x->>'planned_minutes')::integer),0) from pg_catalog.jsonb_array_elements(p_request->'items') x) > (p_request->>'capacity_minutes')::integer then
    raise exception using errcode='P0001',message='Capacity exceeded.';
  end if;
  select coalesce(max(dp.revision),0)+1 into v_revision from public.daily_plans dp where user_id=v_user and plan_date=v_date;
  perform pg_catalog.set_config('taskring.command_context','publication:v1',true);
  update public.daily_plans set status='superseded' where id=v_base and user_id=v_user;
  insert into public.daily_plans(user_id,plan_date,revision,status,capacity_minutes,capacity_breakdown,brief,created_by)
    values(v_user,v_date,v_revision,'active',(p_request->>'capacity_minutes')::integer,
      pg_catalog.jsonb_build_object('protocol','taskring.replan.v0.1','proposal',p_request),p_request->>'brief','ai') returning id into v_plan;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_request->'items') loop
    select dpi.* into v_source from pg_catalog.jsonb_array_elements(p_request->'decisions') d
      join public.daily_plan_items dpi on dpi.id=(d->>'source_item_id')::uuid and dpi.user_id=v_user
      where d->>'decision'='carry' and dpi.task_id=(v_item->>'task_id')::uuid;
    insert into public.daily_plan_items(user_id,plan_id,task_id,bucket,position,planned_minutes,reason,carryover_from_item_id,current_state)
      values(v_user,v_plan,(v_item->>'task_id')::uuid,v_item->>'bucket',v_index,(v_item->>'planned_minutes')::integer,
        v_item->>'reason',v_source.id,case when v_source.current_state='partial' then 'partial' else 'planned' end);
    v_index:=v_index+1;
  end loop;
  perform pg_catalog.set_config('taskring.command_context',coalesce(v_previous,''),true);
  return query select v_plan,v_revision;
end;
$$;
revoke execute on function public.replan_daily_plan_v01(jsonb) from public,anon,service_role;
grant execute on function public.replan_daily_plan_v01(jsonb) to authenticated;
