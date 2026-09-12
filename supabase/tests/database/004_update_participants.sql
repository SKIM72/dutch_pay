begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'participants-owner@example.com',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'participants-outsider@example.com',
    crypt('test-password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.settlements (id, title, date, participants, base_currency, user_id, invite_code)
overriding system value
values (
  4001, '오사카 여행', current_date,
  '["가영","나영","다영"]'::jsonb, 'KRW',
  '40000000-0000-4000-8000-000000000001', 'PART01'
);

insert into public.settlement_members (settlement_id, user_id, email, provider)
values (4001, '40000000-0000-4000-8000-000000000001', 'participants-owner@example.com', 'email');

insert into public.expenses (id, settlement_id, name, original_amount, currency, amount, payer, split, shares)
overriding system value
values
  (4101, 4001, '치킨', 10000, 'KRW', 10000, '가영', 'equal',
   '{"가영":3334,"나영":3333,"다영":3333}'::jsonb),
  (4102, 4001, '택시', 6000, 'KRW', 6000, '나영', 'equal',
   '{"가영":2000,"나영":2000,"다영":2000}'::jsonb);

-- 익명 사용자는 실행할 수 없어야 한다.
set local role anon;
select throws_ok(
  $$ select public.update_settlement_participants(
       4001, '오사카 여행', '["가영","나영","다영"]'::jsonb, '{}'::jsonb, '[]'::jsonb) $$,
  'Authentication required.',
  'anonymous cannot update participants'
);
reset role;

-- 방에 속하지 않은 사용자도 막혀야 한다.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.update_settlement_participants(
       4001, '오사카 여행', '["가영","나영","다영"]'::jsonb, '{}'::jsonb, '[]'::jsonb) $$,
  'Only the settlement owner can update participants.',
  'outsider cannot update participants'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- 유효성 검사
select throws_ok(
  $$ select public.update_settlement_participants(
       4001, '   ', '["가영","나영","다영"]'::jsonb, '{}'::jsonb, '[]'::jsonb) $$,
  'Title is required.',
  'blank title is rejected'
);
select throws_ok(
  $$ select public.update_settlement_participants(
       4001, '오사카 여행', '["가영"]'::jsonb, '{}'::jsonb, '[]'::jsonb) $$,
  'At least 2 participants are required.',
  'fewer than 2 participants is rejected'
);

-- 이름 변경이 지출까지 함께 반영되어야 한다.
select lives_ok(
  $$ select public.update_settlement_participants(
       4001, '오사카 3박4일', '["가영이","나영","다영"]'::jsonb,
       '{"가영":"가영이"}'::jsonb, '[]'::jsonb) $$,
  'owner can rename a participant'
);
select is(
  (select title from public.settlements where id = 4001),
  '오사카 3박4일',
  'title is updated'
);
select is(
  (select participants from public.settlements where id = 4001),
  '["가영이","나영","다영"]'::jsonb,
  'participant list is updated'
);
select is(
  (select payer from public.expenses where id = 4101),
  '가영이',
  'renamed participant is carried into expense payer'
);
select is(
  (select (shares ->> '가영이')::numeric from public.expenses where id = 4101),
  3334::numeric,
  'renamed participant keeps their share'
);
select ok(
  (select not (shares ? '가영') from public.expenses where id = 4101),
  'old participant name no longer appears in shares'
);

-- 결제자로 남아 있는 참여자는 삭제할 수 없어야 한다.
select throws_ok(
  $$ select public.update_settlement_participants(
       4001, '오사카 3박4일', '["가영이","다영"]'::jsonb, '{}'::jsonb, '["나영"]'::jsonb) $$,
  'A removed participant is still the payer of an expense.',
  'cannot remove a participant who paid for an expense'
);

-- 결제자가 아닌 참여자를 빼면 그 사람의 몫도 지출에서 사라지고 총액이 다시 맞아야 한다.
select lives_ok(
  $$ select public.update_settlement_participants(
       4001, '오사카 3박4일', '["가영이","나영"]'::jsonb, '{}'::jsonb, '["다영"]'::jsonb) $$,
  'owner can remove a non-payer participant'
);

select * from finish();
rollback;
