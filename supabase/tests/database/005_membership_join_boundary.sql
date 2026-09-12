begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(9);

-- settlement_members의 INSERT 정책은 방이 "존재하는지"만 확인한다.
-- 그런데 그 exists 검사도 요청한 사용자의 권한(RLS)으로 실행되기 때문에,
-- 멤버가 아닌 사용자에게는 방이 보이지 않아 직접 등록이 막힌다.
-- 이 보호는 settlements 조회 정책에 간접적으로 기대므로, 정책이 바뀌어도
-- 초대 코드 없이는 참가할 수 없다는 계약이 유지되는지 여기서 고정한다.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'join-owner@example.com',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'join-outsider@example.com',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.settlements (id, title, date, participants, base_currency, user_id, invite_code)
overriding system value
values (
  5001, '제주 여행', current_date,
  '["방장","친구"]'::jsonb, 'KRW',
  '50000000-0000-4000-8000-000000000001', 'JOINTEST'
);

insert into public.expenses (id, settlement_id, name, original_amount, currency, amount, payer, split, shares)
overriding system value
values (5101, 5001, '렌터카', 180000, 'KRW', 180000, '방장', 'equal',
        '{"방장":90000,"친구":90000}'::jsonb);

-- 방장: 자기 방에 자기 멤버 행은 직접 만들 수 있어야 한다 (방 생성 직후 동기화 경로).
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","email":"join-owner@example.com"}',
  true
);
select lives_ok(
  $$ insert into public.settlement_members (settlement_id, user_id)
     values (5001, '50000000-0000-4000-8000-000000000001') $$,
  'owner can add their own member row'
);
reset role;

-- 외부 사용자: 초대 코드를 모르는 상태.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated","email":"join-outsider@example.com"}',
  true
);

select is(
  (select count(*)::bigint from public.settlements where id = 5001),
  0::bigint,
  'outsider cannot see a settlement they do not belong to'
);
select throws_ok(
  $$ insert into public.settlement_members (settlement_id, user_id)
     values (5001, '50000000-0000-4000-8000-000000000002') $$,
  '42501',
  null,
  'outsider cannot add themselves to a settlement by its id'
);
select is(
  public.join_settlement_by_invite_code('WRONG999'),
  null::bigint,
  'a wrong invite code does not join'
);
select is(
  public.join_settlement_by_invite_code('5001'),
  null::bigint,
  'a settlement id is not accepted as an invite code'
);
select is(
  (select count(*)::bigint from public.expenses where settlement_id = 5001),
  0::bigint,
  'outsider still cannot see expenses after failed join attempts'
);

-- 올바른 초대 코드로는 참가할 수 있어야 한다.
select is(
  public.join_settlement_by_invite_code('jointest'),
  5001::bigint,
  'the correct invite code joins regardless of letter case'
);
select is(
  (select count(*)::bigint from public.expenses where settlement_id = 5001),
  1::bigint,
  'a joined member can see the settlement expenses'
);
select lives_ok(
  $$ insert into public.settlement_members (settlement_id, user_id, email)
     values (5001, '50000000-0000-4000-8000-000000000002', 'join-outsider@example.com')
     on conflict (settlement_id, user_id) do update set email = excluded.email $$,
  'an existing member can refresh their own member row'
);
reset role;

select * from finish();
rollback;
