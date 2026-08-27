begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(1);

select ok(
  not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = any(array[
        'profiles','goals','projects','tasks','inbox_items','daily_plans',
        'daily_plan_items','task_events','user_feedback','constraints','source_links'
      ])
      and c.contype = 'f'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and (string_to_array(i.indkey::text, ' ')::smallint[])[1:cardinality(c.conkey)] = c.conkey
      )
  ),
  'every business foreign key has a covering index in FK column order'
);

select * from finish();
rollback;
