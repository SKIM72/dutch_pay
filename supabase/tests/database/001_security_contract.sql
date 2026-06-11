begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(32);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.settlements'::regclass),
  'settlements has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.expenses'::regclass),
  'expenses has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.settlement_members'::regclass),
  'settlement_members has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.chat_messages'::regclass),
  'chat_messages has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.settlements', 'SELECT'),
  'anon cannot select settlements directly'
);
select ok(
  not has_table_privilege('anon', 'public.expenses', 'SELECT'),
  'anon cannot select expenses directly'
);
select ok(
  not has_table_privilege('anon', 'public.settlement_members', 'SELECT'),
  'anon cannot select member rows'
);
select ok(
  not has_table_privilege('anon', 'public.chat_messages', 'SELECT'),
  'anon cannot select chat messages'
);

select ok(
  has_column_privilege('anon', 'public.profiles', 'nickname', 'SELECT'),
  'anon may read public nicknames'
);
select ok(
  not has_column_privilege('anon', 'public.profiles', 'admin_pin', 'SELECT'),
  'anon cannot read admin PINs'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'admin_pin', 'SELECT'),
  'authenticated users cannot read admin PINs directly'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'admin_pin', 'UPDATE'),
  'authenticated users cannot update admin PINs directly'
);

select ok(
  has_function_privilege(
    'anon',
    'public.get_public_settlement_by_invite_code(text)',
    'EXECUTE'
  ),
  'anon can execute the read-only public preview RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_settlement_id_by_invite_code(text)',
    'EXECUTE'
  ),
  'anon cannot resolve private settlement IDs'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.join_settlement_by_invite_code(text)',
    'EXECUTE'
  ),
  'anon cannot join settlements'
);
select ok(
  not has_function_privilege('anon', 'public.kick_member(bigint,uuid)', 'EXECUTE'),
  'anon cannot kick members'
);
select ok(
  not has_function_privilege('anon', 'public.delete_user()', 'EXECUTE'),
  'anon cannot delete users'
);
select ok(
  not has_function_privilege('anon', 'public.get_my_admin_pin()', 'EXECUTE'),
  'anon cannot read admin PINs through RPC'
);
select ok(
  not has_function_privilege('anon', 'public.set_my_admin_pin(text)', 'EXECUTE'),
  'anon cannot set admin PINs through RPC'
);

select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename in ('settlements', 'expenses')
      and roles && array['anon'::name, 'public'::name]
  ),
  0::bigint,
  'settlements and expenses have no anon or public policies'
);

select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      and (
        coalesce(qual, '') = 'true'
        or coalesce(with_check, '') = 'true'
      )
  ),
  0::bigint,
  'no write policy grants unconditional access'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_public_settlement_by_invite_code',
        'get_settlement_id_by_invite_code',
        'join_settlement_by_invite_code',
        'get_my_admin_pin',
        'set_my_admin_pin',
        'kick_member',
        'delete_user'
      )
      and not p.prosecdef
  ),
  0::bigint,
  'sensitive RPCs are SECURITY DEFINER functions'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_public_settlement_by_invite_code',
        'get_settlement_id_by_invite_code',
        'join_settlement_by_invite_code',
        'get_my_admin_pin',
        'set_my_admin_pin',
        'kick_member',
        'delete_user'
      )
      and not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ),
  0::bigint,
  'SECURITY DEFINER functions pin an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_settlement_id_by_invite_code(text)',
    'EXECUTE'
  ),
  'authenticated users can resolve invite codes'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.join_settlement_by_invite_code(text)',
    'EXECUTE'
  ),
  'authenticated users can join by invite code'
);
select ok(
  has_function_privilege('authenticated', 'public.kick_member(bigint,uuid)', 'EXECUTE'),
  'authenticated users may call the guarded kick RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.delete_user()', 'EXECUTE'),
  'authenticated users may call the self-delete RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.get_my_admin_pin()', 'EXECUTE'),
  'authenticated users may read only their own PIN through RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.set_my_admin_pin(text)', 'EXECUTE'),
  'authenticated users may update only their own PIN through RPC'
);

select ok(
  has_table_privilege('authenticated', 'public.settlements', 'SELECT'),
  'authenticated role has settlement table access governed by RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.expenses', 'INSERT'),
  'authenticated role can create expenses when RLS permits'
);

select * from finish();
rollback;
