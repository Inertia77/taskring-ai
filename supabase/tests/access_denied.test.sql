begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

set local role anon;
select throws_ok(
  $$select count(*) from public.tasks$$,
  '42501',
  null,
  'anon cannot read business tables before WP003'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select count(*) from public.tasks$$,
  '42501',
  null,
  'authenticated cannot read business tables before WP003 grants and policies'
);
reset role;

select * from finish();
rollback;
