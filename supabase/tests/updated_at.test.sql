begin;

select plan(3);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.tasks'::regclass
      and tgname = 'tasks_set_updated_at'
      and not tgisinternal
  ),
  'tasks has server-side updated_at trigger'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.projects'::regclass
      and tgname = 'projects_set_updated_at'
      and not tgisinternal
  ),
  'projects has server-side updated_at trigger'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_taskring_updated_at'
      and p.prorettype = 'trigger'::regtype
      and p.prosecdef = false
  ),
  'updated_at trigger function is security invoker'
);

select * from finish();
rollback;
