begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(35);

select has_schema('learning', 'learning schema exists');

select is(
  (
    select md5(string_agg(c.relname::text, E'\n' order by c.relname))
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'learning' and c.relkind in ('r','p')
  ),
  '7cc50f5c6090bc9188bce89ebb8bb9f6',
  'learning contains exactly the 11 governed domain tables'
);

select results_eq(
  $$select count(*)::bigint from information_schema.columns where table_schema = 'learning'$$,
  $$values (92::bigint)$$,
  'learning column count matches the adopted production schema'
);

select is(
  (
    select md5(string_agg(
      concat_ws('|', table_name, column_name, ordinal_position::text, udt_name, is_nullable, coalesce(column_default, '')),
      E'\n' order by table_name, ordinal_position
    ))
    from information_schema.columns
    where table_schema = 'learning'
  ),
  '2bac49beaefe7fe6842846c70dcd74a4',
  'learning column types, nullability, defaults and order match the adopted schema'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'learning'
  $$,
  $$values (52::bigint)$$,
  'learning constraint count matches the adopted schema'
);

select is(
  (
    select md5(string_agg(
      concat_ws('|', c.conrelid::regclass::text, c.conname, c.contype, pg_get_constraintdef(c.oid, true)),
      E'\n' order by c.conrelid::regclass::text, c.conname
    ))
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'learning'
  ),
  '151768f92894bc443cceb306f2245180',
  'learning PK, FK, UNIQUE and CHECK constraints match the adopted schema'
);

select results_eq(
  $$select count(*)::bigint from pg_indexes where schemaname = 'learning'$$,
  $$values (16::bigint)$$,
  'learning index count matches the adopted schema'
);

select is(
  (
    select md5(string_agg(
      concat_ws('|', tablename, indexname, indexdef),
      E'\n' order by tablename, indexname
    ))
    from pg_indexes
    where schemaname = 'learning'
  ),
  '94c1d6a9b94c30270eb3d9e81fb98c79',
  'learning indexes match the adopted schema'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'learning'
      and c.relkind in ('r','p')
      and c.relrowsecurity
  $$,
  $$values (11::bigint)$$,
  'RLS is enabled on all 11 learning tables'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'learning'
      and c.relkind in ('r','p')
      and c.relforcerowsecurity
  $$,
  $$values (0::bigint)$$,
  'learning does not FORCE RLS so owner/admin tooling remains available'
);

select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname = 'learning'$$,
  $$values (0::bigint)$$,
  'learning intentionally has zero browser-client RLS policies'
);

select ok(not has_schema_privilege('anon', 'learning', 'USAGE'), 'anon cannot use learning schema');
select ok(not has_schema_privilege('authenticated', 'learning', 'USAGE'), 'authenticated cannot use learning schema');
select ok(not has_schema_privilege('service_role', 'learning', 'USAGE'), 'service_role cannot use learning schema directly');
select ok(not has_schema_privilege('authenticator', 'learning', 'USAGE'), 'authenticator cannot use learning schema');

select results_eq(
  $$
    select count(*)::bigint
    from information_schema.role_table_grants
    where table_schema = 'learning' and grantee = 'anon'
  $$,
  $$values (0::bigint)$$,
  'anon has no learning table privileges'
);

select results_eq(
  $$
    select count(*)::bigint
    from information_schema.role_table_grants
    where table_schema = 'learning' and grantee = 'authenticated'
  $$,
  $$values (0::bigint)$$,
  'authenticated has no learning table privileges'
);

select results_eq(
  $$
    select count(*)::bigint
    from information_schema.role_table_grants
    where table_schema = 'learning' and grantee = 'service_role'
  $$,
  $$values (0::bigint)$$,
  'service_role has no learning table privileges'
);

select results_eq(
  $$
    select count(*)::bigint
    from information_schema.role_table_grants
    where table_schema = 'learning' and grantee = 'authenticator'
  $$,
  $$values (0::bigint)$$,
  'authenticator has no learning table privileges'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_namespace n
    cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    where n.nspname = 'learning' and a.grantee = 0
  $$,
  $$values (0::bigint)$$,
  'PUBLIC has no learning schema privilege'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'learning'
      and c.relkind in ('r','p')
      and a.grantee = 0
  $$,
  $$values (0::bigint)$$,
  'PUBLIC has no learning table privilege'
);

select results_eq(
  $$
    select (
      (select count(*) from learning.domains) +
      (select count(*) from learning.topics) +
      (select count(*) from learning.prerequisites) +
      (select count(*) from learning.seasons) +
      (select count(*) from learning.sessions) +
      (select count(*) from learning.session_items) +
      (select count(*) from learning.feedback) +
      (select count(*) from learning.mastery_evidence) +
      (select count(*) from learning.mastery) +
      (select count(*) from learning.review_queue) +
      (select count(*) from learning.planner_state)
    )::bigint
  $$,
  $$values (0::bigint)$$,
  'fresh learning domain contains no personal seed data'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  $$,
  $$values (11::bigint)$$,
  'TaskRing public business table count remains 11'
);

select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname = 'public'$$,
  $$values (12::bigint)$$,
  'TaskRing public policy count remains 12'
);

select is(
  (
    select md5(string_agg(p.proname::text, E'\n' order by p.proname))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f','p')
  ),
  'edc5edeadfc66717f32b44838c5b9da6',
  'TaskRing public function surface remains unchanged'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v','m')
      and pg_get_viewdef(c.oid, true) ilike '%learning.%'
  $$,
  $$values (0::bigint)$$,
  'no public view exposes the learning domain'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f','p')
      and pg_get_functiondef(p.oid) ilike '%learning.%'
  $$,
  $$values (0::bigint)$$,
  'no public routine exposes the learning domain'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'learning' and c.relkind in ('v','m')
  $$,
  $$values (0::bigint)$$,
  'learning has no views'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'learning' and p.prokind in ('f','p')
  $$,
  $$values (0::bigint)$$,
  'learning has no routines'
);

select results_eq(
  $$select count(*)::bigint from pg_sequences where schemaname = 'learning'$$,
  $$values (0::bigint)$$,
  'learning has no sequences'
);

select results_eq(
  $$select count(*)::bigint from pg_tables where schemaname = 'learning' and tableowner = 'postgres'$$,
  $$values (11::bigint)$$,
  'postgres owns all learning tables'
);

select results_eq(
  $$select count(*)::bigint from pg_namespace where nspname = 'learning' and nspowner = 'postgres'::regrole$$,
  $$values (1::bigint)$$,
  'postgres owns the learning schema'
);

select ok(has_schema_privilege('postgres', 'learning', 'USAGE'), 'postgres owner/admin tooling can use learning schema');

select results_eq(
  $$
    select count(*)::bigint
    from pg_publication_tables
    where schemaname = 'learning'
  $$,
  $$values (0::bigint)$$,
  'learning is not published through Realtime'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v','m')
  $$,
  $$values (0::bigint)$$,
  'TaskRing public view count remains zero'
);

select * from finish();
rollback;
