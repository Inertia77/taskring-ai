create or replace function public.taskring_command_guard_v01()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_context text := pg_catalog.current_setting('taskring.command_context', true);
begin
  if tg_table_name = 'task_events' then
    if tg_op = 'INSERT' and v_context = 'execution:v1' then
      return new;
    end if;
    raise exception using errcode = 'P0001', message = 'Execution mutations must use record_task_action_v01.';
  end if;

  if tg_table_name = 'daily_plans' then
    if v_context = 'publication:v1' then
      return new;
    end if;
    raise exception using errcode = 'P0001', message = 'Daily Plan mutations must use publish_daily_plan_v01.';
  end if;

  if tg_table_name = 'daily_plan_items' then
    if v_context = 'publication:v1' then
      return new;
    end if;

    if tg_op = 'UPDATE' and v_context = 'execution:v1' then
      if (pg_catalog.to_jsonb(new) - 'current_state' - 'updated_at')
         is distinct from
         (pg_catalog.to_jsonb(old) - 'current_state' - 'updated_at') then
        raise exception using errcode = 'P0001', message = 'Execution command may only change the Plan Item execution projection.';
      end if;
      return new;
    end if;

    raise exception using errcode = 'P0001', message = 'Daily Plan Item mutations must use an approved command boundary.';
  end if;

  if tg_table_name = 'user_feedback' then
    if tg_op = 'INSERT' and v_context = 'feedback:v1' then
      return new;
    end if;
    raise exception using errcode = 'P0001', message = 'Feedback mutations must use add_plan_item_feedback_v01.';
  end if;

  if tg_table_name = 'tasks' and tg_op = 'UPDATE' then
    if v_context = 'execution:v1' then
      return new;
    end if;

    if old.status in ('done', 'blocked')
       or new.status in ('done', 'blocked')
       or new.completed_at is distinct from old.completed_at then
      raise exception using errcode = 'P0001', message = 'Execution projections must use record_task_action_v01.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

revoke execute on function public.taskring_command_guard_v01() from public;
revoke execute on function public.taskring_command_guard_v01() from anon;
revoke execute on function public.taskring_command_guard_v01() from authenticated;
revoke execute on function public.taskring_command_guard_v01() from service_role;

drop trigger if exists taskring_guard_task_events_insert on public.task_events;
create trigger taskring_guard_task_events_insert
before insert on public.task_events
for each row execute function public.taskring_command_guard_v01();

drop trigger if exists taskring_guard_daily_plans_mutation on public.daily_plans;
create trigger taskring_guard_daily_plans_mutation
before insert or update on public.daily_plans
for each row execute function public.taskring_command_guard_v01();

drop trigger if exists taskring_guard_daily_plan_items_mutation on public.daily_plan_items;
create trigger taskring_guard_daily_plan_items_mutation
before insert or update on public.daily_plan_items
for each row execute function public.taskring_command_guard_v01();

drop trigger if exists taskring_guard_user_feedback_insert on public.user_feedback;
create trigger taskring_guard_user_feedback_insert
before insert on public.user_feedback
for each row execute function public.taskring_command_guard_v01();

drop trigger if exists taskring_guard_tasks_execution_projection on public.tasks;
create trigger taskring_guard_tasks_execution_projection
before update on public.tasks
for each row execute function public.taskring_command_guard_v01();

revoke delete on table public.daily_plans from authenticated;
revoke delete on table public.daily_plan_items from authenticated;
revoke update, delete on table public.user_feedback from authenticated;

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

revoke execute on function public.publish_daily_plan_v01(date, uuid, jsonb, integer, jsonb, text) from public;
revoke execute on function public.publish_daily_plan_v01(date, uuid, jsonb, integer, jsonb, text) from anon;
revoke execute on function public.publish_daily_plan_v01(date, uuid, jsonb, integer, jsonb, text) from service_role;
grant execute on function public.publish_daily_plan_v01(date, uuid, jsonb, integer, jsonb, text) to authenticated;

create or replace function public.record_task_action_v01(
  p_event_id uuid,
  p_plan_item_id uuid,
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
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if p_event_id is null or p_plan_item_id is null then
    raise exception using errcode = 'P0001', message = 'Event ID and Plan Item are required.';
  end if;
  if p_action not in ('started','partial','done','skipped','deferred','blocked','cancelled','reopened') then
    raise exception using errcode = 'P0001', message = 'Unsupported task action.';
  end if;
  if p_progress_percent is not null and (p_progress_percent <= 0 or p_progress_percent >= 100) then
    raise exception using errcode = 'P0001', message = 'Partial progress must be greater than 0 and less than 100.';
  end if;
  if p_remaining_minutes is not null and p_remaining_minutes < 0 then
    raise exception using errcode = 'P0001', message = 'Remaining minutes must be zero or greater.';
  end if;
  if p_actual_minutes is not null and p_actual_minutes < 0 then
    raise exception using errcode = 'P0001', message = 'Actual minutes must be zero or greater.';
  end if;
  if p_action = 'partial' and p_progress_percent is null and p_remaining_minutes is null then
    raise exception using errcode = 'P0001', message = 'Partial requires progress percent or remaining minutes.';
  end if;
  if p_action <> 'partial' and (p_progress_percent is not null or p_remaining_minutes is not null) then
    raise exception using errcode = 'P0001', message = 'Progress and remaining minutes are only valid for Partial.';
  end if;
  if p_actual_minutes is not null and p_action not in ('partial','done') then
    raise exception using errcode = 'P0001', message = 'Actual minutes are only valid for Partial or Done.';
  end if;

  select * into v_existing
  from public.task_events
  where id = p_event_id
    and user_id = v_user_id;

  if found then
    if v_existing.plan_item_id is not distinct from p_plan_item_id
       and v_existing.event_type = p_action
       and v_existing.progress_percent is not distinct from p_progress_percent
       and v_existing.remaining_minutes is not distinct from p_remaining_minutes
       and v_existing.actual_minutes is not distinct from p_actual_minutes
       and v_existing.reason is not distinct from v_reason
       and v_existing.note is not distinct from v_note then
      return query select v_existing.id;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'Idempotency conflict.';
  end if;

  select dpi.* into v_item
  from public.daily_plan_items as dpi
  join public.daily_plans as dp
    on dp.id = dpi.plan_id and dp.user_id = dpi.user_id
  where dpi.id = p_plan_item_id
    and dpi.user_id = v_user_id
    and dp.status = 'active'
  for update of dpi;

  if not found then
    raise exception using errcode = 'P0001', message = 'Plan Item is unavailable.';
  end if;

  select * into v_task
  from public.tasks
  where id = v_item.task_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Task is unavailable.';
  end if;

  if p_action <> 'reopened' and v_task.status in ('done','cancelled') then
    raise exception using errcode = 'P0001', message = 'Task is no longer executable.';
  end if;

  if not (
    (v_item.current_state = 'planned' and p_action in ('started','partial','done','skipped','deferred','blocked','cancelled'))
    or (v_item.current_state = 'started' and p_action in ('partial','done','skipped','deferred','blocked','cancelled'))
    or (v_item.current_state = 'partial' and p_action in ('partial','done','deferred','blocked','cancelled'))
    or (v_item.current_state = 'blocked' and p_action in ('done','deferred','cancelled','reopened'))
    or (v_item.current_state in ('done','skipped','deferred','cancelled') and p_action = 'reopened')
  ) then
    raise exception using errcode = 'P0001', message = 'Invalid execution state transition.';
  end if;

  v_target_state := case p_action when 'reopened' then 'started' else p_action end;
  perform pg_catalog.set_config('taskring.command_context', 'execution:v1', true);

  begin
    insert into public.task_events (
      id, user_id, task_id, plan_item_id, event_type, occurred_at,
      progress_percent, remaining_minutes, actual_minutes, reason, note,
      actor, metadata
    ) values (
      p_event_id, v_user_id, v_item.task_id, v_item.id, p_action, v_occurred_at,
      p_progress_percent, p_remaining_minutes, p_actual_minutes, v_reason, v_note,
      'user', '{}'::jsonb
    );
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'Idempotency conflict.';
  end;

  update public.daily_plan_items
  set current_state = v_target_state,
      updated_at = pg_catalog.clock_timestamp()
  where id = v_item.id
    and user_id = v_user_id;

  if p_action = 'partial' and p_remaining_minutes is not null then
    update public.tasks
    set remaining_minutes = p_remaining_minutes
    where id = v_task.id and user_id = v_user_id;
  elsif p_action = 'done' then
    update public.tasks
    set status = 'done', completed_at = v_occurred_at, remaining_minutes = 0
    where id = v_task.id and user_id = v_user_id;
  elsif p_action = 'blocked' then
    update public.tasks
    set status = 'blocked'
    where id = v_task.id and user_id = v_user_id;
  elsif p_action = 'cancelled' then
    update public.tasks
    set status = 'cancelled'
    where id = v_task.id and user_id = v_user_id;
  elsif p_action = 'reopened' then
    update public.tasks
    set status = 'active', completed_at = null
    where id = v_task.id and user_id = v_user_id;
  end if;

  return query select p_event_id;
end;
$$;

revoke execute on function public.record_task_action_v01(uuid, uuid, text, timestamptz, numeric, integer, integer, text, text) from public;
revoke execute on function public.record_task_action_v01(uuid, uuid, text, timestamptz, numeric, integer, integer, text, text) from anon;
revoke execute on function public.record_task_action_v01(uuid, uuid, text, timestamptz, numeric, integer, integer, text, text) from service_role;
grant execute on function public.record_task_action_v01(uuid, uuid, text, timestamptz, numeric, integer, integer, text, text) to authenticated;

create or replace function public.add_plan_item_feedback_v01(
  p_feedback_id uuid,
  p_plan_item_id uuid,
  p_content text
)
returns table(feedback_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.daily_plan_items%rowtype;
  v_existing public.user_feedback%rowtype;
  v_content text := pg_catalog.btrim(coalesce(p_content, ''));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if p_feedback_id is null or p_plan_item_id is null then
    raise exception using errcode = 'P0001', message = 'Feedback ID and Plan Item are required.';
  end if;
  if v_content = '' then
    raise exception using errcode = 'P0001', message = 'Feedback content is required.';
  end if;

  select * into v_existing
  from public.user_feedback
  where id = p_feedback_id
    and user_id = v_user_id;

  if found then
    if v_existing.plan_item_id is not distinct from p_plan_item_id
       and v_existing.content = v_content
       and v_existing.source = 'frontend'
       and v_existing.ai_interpretation is null then
      return query select v_existing.id;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'Idempotency conflict.';
  end if;

  select * into v_item
  from public.daily_plan_items
  where id = p_plan_item_id
    and user_id = v_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'Plan Item is unavailable.';
  end if;

  perform pg_catalog.set_config('taskring.command_context', 'feedback:v1', true);

  begin
    insert into public.user_feedback (
      id, user_id, task_id, plan_id, plan_item_id,
      content, source, ai_interpretation
    ) values (
      p_feedback_id, v_user_id, v_item.task_id, v_item.plan_id, v_item.id,
      v_content, 'frontend', null
    );
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'Idempotency conflict.';
  end;

  return query select p_feedback_id;
end;
$$;

revoke execute on function public.add_plan_item_feedback_v01(uuid, uuid, text) from public;
revoke execute on function public.add_plan_item_feedback_v01(uuid, uuid, text) from anon;
revoke execute on function public.add_plan_item_feedback_v01(uuid, uuid, text) from service_role;
grant execute on function public.add_plan_item_feedback_v01(uuid, uuid, text) to authenticated;
create or replace function public.taskring_command_guard_v01()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_context text := pg_catalog.current_setting('taskring.command_context', true);
begin
  if tg_table_name = 'task_events' then
    if tg_op = 'INSERT' and v_context = 'execution:v1' then return new; end if;
    raise exception using errcode='P0001', message='Execution mutations must use record_task_action_v01.';
  end if;

  if tg_table_name = 'daily_plans' then
    if v_context = 'publication:v1' then return new; end if;
    raise exception using errcode='P0001', message='Daily Plan mutations must use publish_daily_plan_v01.';
  end if;

  if tg_table_name = 'daily_plan_items' then
    if v_context = 'publication:v1' then return new; end if;
    if tg_op = 'UPDATE' and v_context = 'execution:v1' then
      if (pg_catalog.to_jsonb(new) - 'current_state' - 'updated_at')
         is distinct from
         (pg_catalog.to_jsonb(old) - 'current_state' - 'updated_at') then
        raise exception using errcode='P0001', message='Execution command may only change the Plan Item execution projection.';
      end if;
      return new;
    end if;
    raise exception using errcode='P0001', message='Daily Plan Item mutations must use an approved command boundary.';
  end if;

  if tg_table_name = 'user_feedback' then
    if tg_op = 'INSERT' and v_context = 'feedback:v1' then return new; end if;
    raise exception using errcode='P0001', message='Feedback mutations must use add_plan_item_feedback_v01.';
  end if;

  if tg_table_name = 'tasks' and tg_op = 'UPDATE' then
    if v_context = 'execution:v1' then return new; end if;
    if new.status in ('done','blocked')
       or (old.status in ('done','blocked') and new.status <> 'cancelled')
       or new.completed_at is distinct from old.completed_at then
      raise exception using errcode='P0001', message='Execution projections must use record_task_action_v01.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

revoke execute on function public.taskring_command_guard_v01() from public;
revoke execute on function public.taskring_command_guard_v01() from anon;
revoke execute on function public.taskring_command_guard_v01() from authenticated;
revoke execute on function public.taskring_command_guard_v01() from service_role;

drop function public.record_task_action_v01(uuid, uuid, text, timestamptz, numeric, integer, integer, text, text);

create function public.record_task_action_v01(
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

revoke execute on function public.record_task_action_v01(uuid,uuid,text,text,timestamptz,numeric,integer,integer,text,text) from public;
revoke execute on function public.record_task_action_v01(uuid,uuid,text,text,timestamptz,numeric,integer,integer,text,text) from anon;
revoke execute on function public.record_task_action_v01(uuid,uuid,text,text,timestamptz,numeric,integer,integer,text,text) from service_role;
grant execute on function public.record_task_action_v01(uuid,uuid,text,text,timestamptz,numeric,integer,integer,text,text) to authenticated;

create or replace function public.add_plan_item_feedback_v01(
  p_feedback_id uuid,
  p_plan_item_id uuid,
  p_content text
)
returns table(feedback_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.daily_plan_items%rowtype;
  v_existing public.user_feedback%rowtype;
  v_content text := pg_catalog.btrim(coalesce(p_content,''));
  v_previous_context text := pg_catalog.current_setting('taskring.command_context', true);
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required.'; end if;
  if p_feedback_id is null or p_plan_item_id is null then raise exception using errcode='P0001', message='Feedback ID and Plan Item are required.'; end if;
  if v_content='' then raise exception using errcode='P0001', message='Feedback content is required.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_feedback_id::text, 11));

  select * into v_existing from public.user_feedback where id=p_feedback_id and user_id=v_user_id;
  if found then
    if v_existing.plan_item_id is not distinct from p_plan_item_id
       and v_existing.content=v_content
       and v_existing.source='frontend'
       and v_existing.ai_interpretation is null then
      return query select v_existing.id;
      return;
    end if;
    raise exception using errcode='P0001', message='Idempotency conflict.';
  end if;

  select * into v_item from public.daily_plan_items where id=p_plan_item_id and user_id=v_user_id;
  if not found then raise exception using errcode='P0001', message='Plan Item is unavailable.'; end if;

  perform pg_catalog.set_config('taskring.command_context','feedback:v1',true);
  insert into public.user_feedback(id,user_id,task_id,plan_id,plan_item_id,content,source,ai_interpretation)
  values(p_feedback_id,v_user_id,v_item.task_id,v_item.plan_id,v_item.id,v_content,'frontend',null);
  perform pg_catalog.set_config('taskring.command_context', coalesce(v_previous_context, ''), true);
  return query select p_feedback_id;
end;
$$;

revoke execute on function public.add_plan_item_feedback_v01(uuid,uuid,text) from public;
revoke execute on function public.add_plan_item_feedback_v01(uuid,uuid,text) from anon;
revoke execute on function public.add_plan_item_feedback_v01(uuid,uuid,text) from service_role;
grant execute on function public.add_plan_item_feedback_v01(uuid,uuid,text) to authenticated;
