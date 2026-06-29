begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(15);

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
    '30000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'friend-owner@example.com',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'friend-target@example.com',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'friend-outsider@example.com',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

insert into public.profiles (user_id, nickname, friend_code)
values
  ('30000000-0000-4000-8000-000000000001', 'Owner Friend', 'OWNER00001'),
  ('30000000-0000-4000-8000-000000000002', 'Target Friend', 'TARGET0001'),
  ('30000000-0000-4000-8000-000000000003', 'Outsider Friend', 'OUTSIDE001');

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
  3001,
  'Friend invite trip',
  '2026-06-29',
  '["Owner Friend","Target Friend"]',
  'JPY',
  false,
  '30000000-0000-4000-8000-000000000001',
  'FRIEND'
);

select ok(
  not has_table_privilege('authenticated', 'public.friendships', 'SELECT'),
  'friendship rows are not directly readable'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'friend_code', 'SELECT'),
  'friend codes are not directly readable'
);
select ok(
  not has_function_privilege('anon', 'public.get_friend_dashboard()', 'EXECUTE'),
  'anonymous users cannot load friend data'
);
select ok(
  has_function_privilege('authenticated', 'public.get_friend_dashboard()', 'EXECUTE'),
  'authenticated users can load their own friend dashboard'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","email":"friend-owner@example.com"}',
  true
);
select is(
  public.get_friend_dashboard() ->> 'friendCode',
  'OWNER00001',
  'a user can read only the personal friend code through RPC'
);
select lives_ok(
  $$ select public.send_friend_request_by_code('target0001') $$,
  'a friend request can be sent using a case-insensitive code'
);
select is(
  jsonb_array_length(public.get_friend_dashboard() -> 'outgoing'),
  1,
  'the sender sees one outgoing request'
);
select throws_ok(
  $$ select public.send_friend_request_by_code('OWNER00001') $$,
  'P0001',
  'You cannot add yourself.',
  'a user cannot send a request to the same account'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","email":"friend-target@example.com"}',
  true
);
select is(
  jsonb_array_length(public.get_friend_dashboard() -> 'incoming'),
  1,
  'the recipient sees one incoming request'
);
select lives_ok(
  $$ select public.respond_friend_request(
    ((public.get_friend_dashboard() -> 'incoming' -> 0 ->> 'requestId')::bigint),
    true
  ) $$,
  'the recipient can accept the request'
);
select is(
  jsonb_array_length(public.get_friend_dashboard() -> 'friends'),
  1,
  'the accepted account appears in the friend list'
);
select throws_ok(
  $$ select public.invite_friends_to_settlement(
    3001,
    array['30000000-0000-4000-8000-000000000001'::uuid]
  ) $$,
  'P0001',
  'Only the settlement owner can invite friends.',
  'a non-owner cannot add friends to another room'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","email":"friend-owner@example.com"}',
  true
);
select is(
  public.invite_friends_to_settlement(
    3001,
    array['30000000-0000-4000-8000-000000000002'::uuid]
  ),
  1,
  'the owner can add an accepted friend to the room'
);
select is(
  (
    select count(*)::integer
    from public.settlement_members
    where settlement_id = 3001
      and user_id = '30000000-0000-4000-8000-000000000002'
  ),
  1,
  'the friend receives a settlement member row'
);
select throws_ok(
  $$ select public.invite_friends_to_settlement(
    3001,
    array['30000000-0000-4000-8000-000000000003'::uuid]
  ) $$,
  'P0001',
  'Every invited account must be an accepted friend.',
  'the owner cannot auto-invite an account that is not an accepted friend'
);

select * from finish();
rollback;
