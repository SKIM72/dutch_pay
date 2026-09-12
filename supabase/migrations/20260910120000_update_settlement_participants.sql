-- 참여자 명단 수정을 하나의 트랜잭션으로 처리한다.
--
-- 지출은 참여자를 이름 문자열로 참조한다(expenses.payer, expenses.shares의 키).
-- 그래서 이름을 바꾸려면 settlements.participants와 관련 expenses를 함께 고쳐야 하는데,
-- 클라이언트에서 여러 번 나눠 호출하면 중간에 실패했을 때
-- "명단은 새 이름인데 지출은 옛 이름"인 상태가 남는다.
-- 이 함수는 전부 성공하거나 전부 되돌아가도록 보장한다.

create or replace function public.update_settlement_participants(
  p_settlement_id bigint,
  p_title text,
  p_participants jsonb,
  p_renames jsonb default '{}'::jsonb,
  p_removed jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense record;
  v_new_shares jsonb;
  v_new_payer text;
  v_key text;
  v_target text;
  v_amount numeric;
  v_removed text[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  -- settlements의 RLS UPDATE 정책은 방장 전용이다.
  -- 이 함수는 security definer라 RLS를 우회하므로, 같은 경계를 여기서 직접 지킨다.
  if not public.is_settlement_owner(p_settlement_id) then
    raise exception 'Only the settlement owner can update participants.';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'Title is required.';
  end if;

  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) < 2 then
    raise exception 'At least 2 participants are required.';
  end if;

  select coalesce(array_agg(value #>> '{}'), '{}')
    into v_removed
  from jsonb_array_elements(p_removed) as value;

  -- 빠지는 참여자가 아직 결제자로 남아 있으면 지출 내역이 끊기므로 먼저 막는다.
  if exists (
    select 1
    from public.expenses e
    where e.settlement_id = p_settlement_id
      and e.payer = any(v_removed)
  ) then
    raise exception 'A removed participant is still the payer of an expense.';
  end if;

  update public.settlements
     set title = btrim(p_title),
         participants = p_participants
   where id = p_settlement_id;

  if not found then
    raise exception 'Settlement not found.';
  end if;

  -- 이름 변경/삭제를 지출에 반영한다.
  for v_expense in
    select id, payer, shares
    from public.expenses
    where settlement_id = p_settlement_id
  loop
    v_new_shares := '{}'::jsonb;

    for v_key in select jsonb_object_keys(coalesce(v_expense.shares, '{}'::jsonb))
    loop
      continue when v_key = any(v_removed);

      v_target := coalesce(p_renames ->> v_key, v_key);
      v_amount := coalesce((v_expense.shares ->> v_key)::numeric, 0);

      -- 두 이름이 같은 이름으로 합쳐지는 경우를 대비해 더한다.
      v_new_shares := v_new_shares || jsonb_build_object(
        v_target,
        coalesce((v_new_shares ->> v_target)::numeric, 0) + v_amount
      );
    end loop;

    v_new_payer := coalesce(p_renames ->> v_expense.payer, v_expense.payer);

    if v_new_shares is distinct from coalesce(v_expense.shares, '{}'::jsonb)
       or v_new_payer is distinct from v_expense.payer then
      update public.expenses
         set payer = v_new_payer,
             shares = v_new_shares,
             amount = coalesce((
               select sum((value #>> '{}')::numeric)
               from jsonb_each(v_new_shares) as value
             ), 0)
       where id = v_expense.id;
    end if;
  end loop;
end;
$$;

revoke all on function public.update_settlement_participants(bigint, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.update_settlement_participants(bigint, text, jsonb, jsonb, jsonb) to authenticated, service_role;
