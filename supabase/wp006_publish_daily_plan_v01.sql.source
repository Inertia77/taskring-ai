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
        and dpi.current_state <> 'planned'
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

    update public.daily_plans
    set status = 'superseded'
    where id = v_current.id
      and user_id = v_user_id;
  else
    v_capacity_minutes := p_capacity_minutes;
    v_capacity_breakdown := coalesce(p_capacity_breakdown, '{}'::jsonb);
    v_brief := p_brief;
  end if;

  insert into public.daily_plans (
    user_id,
    plan_date,
    revision,
    status,
    capacity_minutes,
    capacity_breakdown,
    brief,
    created_by
  ) values (
    v_user_id,
    p_plan_date,
    v_next_revision,
    'active',
    v_capacity_minutes,
    v_capacity_breakdown,
    v_brief,
    'user'
  )
  returning id into v_new_plan_id;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(p_items) as items(value)
  loop
    insert into public.daily_plan_items (
      user_id,
      plan_id,
      task_id,
      bucket,
      position,
      planned_minutes,
      reason,
      carryover_from_item_id,
      current_state
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

  return query select v_new_plan_id, v_next_revision;
end;
$$;

revoke execute on function public.publish_daily_plan_v01(date, uuid, jsonb, integer, jsonb, text) from public;
revoke execute on function public.publish_daily_plan_v01(date, uuid, jsonb, integer, jsonb, text) from anon;
revoke execute on function public.publish_daily_plan_v01(date, uuid, jsonb, integer, jsonb, text) from service_role;
grant execute on function public.publish_daily_plan_v01(date, uuid, jsonb, integer, jsonb, text) to authenticated;
