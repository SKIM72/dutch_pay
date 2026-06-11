begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(24);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner@example.com',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'member@example.com',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'outsider@example.com',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'joiner@example.com',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

insert into public.profiles (user_id, nickname, admin_pin)
values
  ('10000000-0000-0000-0000-000000000001', 'Owner', '1111'),
  ('10000000-0000-0000-0000-000000000002', 'Member', '2222'),
  ('10000000-0000-0000-0000-000000000003', 'Outsider', '3333'),
  ('10000000-0000-0000-0000-000000000004', 'Joiner', null);

insert into public.settlements (
  id,
  title,
  date,
  participants,
  base_currency,
  is_settled,
  user_id,
  invite_code
)
overriding system value
values (
  1001,
  'Security test trip',
  '2026-06-11',
  '["Owner","Member"]',
  'JPY',
  false,
  '10000000-0000-0000-0000-000000000001',
  'ABC123'
);

insert into public.settlement_members (
  settlement_id,
  user_id,
  email,
  provider
)
values (
  1001,
  '10000000-0000-0000-0000-000000000002',
  'member@example.com',
  'email'
);

insert into public.expenses (
  id,
  settlement_id,
  name,
  original_amount,
  currency,
  amount,
  payer,
  split,
  shares,
  expense_date,
  user_id
)
overriding system value
values (
  2001,
  1001,
  'Airport train',
  10000,
  'JPY',
  10000,
  'Owner',
  'equal',
  '{"Owner":5000,"Member":5000}',
  '2026-06-11 09:00:00+00',
  '10000000-0000-0000-0000-000000000001'
);

set local role anon;
select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);

select is(
  public.get_public_settlement_by_invite_code('abc123') ->> 'title',
  'Security test trip',
  'anon can load a valid read-only invite preview'
);
select is(
  jsonb_array_length(
    public.get_public_settlement_by_invite_code('ABC123') -> 'expenses'
  ),
  1,
  'public preview includes the room expenses'
);
select ok(
  not (
    public.get_public_settlement_by_invite_code('ABC123')
    -> 'expenses'
    -> 0
  ) ? 'user_id',
  'public preview does not expose expense user IDs'
);
select is(
  public.get_public_settlement_by_invite_code('bad-code'),
  null::jsonb,
  'invalid invite formats return no preview'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"owner@example.com","app_metadata":{"provider":"email"}}',
  true
);
select is(
  (select count(*)::bigint from public.settlements),
  1::bigint,
  'owner can view the owned settlement'
);
select is(
  (select count(*)::bigint from public.expenses),
  1::bigint,
  'owner can view expenses in the owned settlement'
);
select is(
  public.get_my_admin_pin(),
  '1111',
  'owner reads only the owner PIN through RPC'
);
select lives_ok(
  $$ select public.set_my_admin_pin('9191') $$,
  'owner can update the owner PIN through RPC'
);
select is(
  public.get_my_admin_pin(),
  '9191',
  'updated owner PIN is returned'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","email":"member@example.com","app_metadata":{"provider":"email"}}',
  true
);
select is(
  (select count(*)::bigint from public.settlements),
  1::bigint,
  'joined member can view the settlement'
);
select is(
  (select count(*)::bigint from public.expenses),
  1::bigint,
  'joined member can view settlement expenses'
);
select is(
  public.get_my_admin_pin(),
  '2222',
  'member cannot read another profile PIN through RPC'
);
select lives_ok(
  $$ update public.expenses set name = 'Updated train' where id = 2001 $$,
  'joined member can edit collaborative room expenses'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","email":"outsider@example.com","app_metadata":{"provider":"email"}}',
  true
);
select is(
  (select count(*)::bigint from public.settlements),
  0::bigint,
  'outsider cannot view the settlement'
);
select is(
  (select count(*)::bigint from public.expenses),
  0::bigint,
  'outsider cannot view settlement expenses'
);
select throws_ok(
  $$ select public.kick_member(1001, '10000000-0000-0000-0000-000000000002') $$,
  'P0001',
  'Only the settlement owner can remove members.',
  'outsider cannot remove a member'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","email":"joiner@example.com","app_metadata":{"provider":"email"}}',
  true
);
select is(
  public.get_settlement_id_by_invite_code('abc123'),
  1001::bigint,
  'authenticated user can resolve a valid invite code'
);
select is(
  public.join_settlement_by_invite_code('abc123'),
  1001::bigint,
  'authenticated user can join through the guarded RPC'
);
select is(
  (select count(*)::bigint from public.settlements),
  1::bigint,
  'newly joined user can view the settlement'
);
select is(
  (select count(*)::bigint from public.expenses),
  1::bigint,
  'newly joined user can view settlement expenses'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"owner@example.com","app_metadata":{"provider":"email"}}',
  true
);
select lives_ok(
  $$ select public.kick_member(1001, '10000000-0000-0000-0000-000000000002') $$,
  'owner can remove a joined member'
);
select is(
  (
    select count(*)::bigint
    from public.settlement_members
    where user_id = '10000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'removed member row is deleted'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","email":"member@example.com","app_metadata":{"provider":"email"}}',
  true
);
select is(
  (select count(*)::bigint from public.settlements),
  0::bigint,
  'removed member immediately loses settlement access'
);
select is(
  (select count(*)::bigint from public.expenses),
  0::bigint,
  'removed member immediately loses expense access'
);
reset role;

select * from finish();
rollback;
