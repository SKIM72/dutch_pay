import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditSchema,
  formatAuditReport,
  splitSqlStatements
} from '../../scripts/audit-supabase-schema.mjs';

const TABLES = `
create table public.settlements (
  id bigint, created_at timestamptz, title text, date date, participants jsonb,
  base_currency text, is_settled boolean, user_id uuid, invite_code text,
  deleted_at timestamptz
);
create table public.expenses (
  id bigint, created_at timestamptz, settlement_id bigint, name text,
  original_amount numeric, currency text, amount numeric, payer text,
  split text, shares jsonb, expense_date timestamptz, user_id uuid
);
create table public.profiles (
  user_id uuid, nickname text, created_at timestamptz, admin_pin text
);
create table public.settlement_members (
  id bigint, settlement_id bigint, user_id uuid, email text, provider text,
  joined_at timestamptz, last_read_at timestamptz
);
create table public.chat_messages (
  id uuid, settlement_id bigint, user_id uuid, content text,
  created_at timestamptz, is_edited boolean, is_deleted boolean,
  is_hidden_admin boolean
);
alter table public.settlements enable row level security;
alter table public.expenses enable row level security;
alter table public.profiles enable row level security;
alter table public.settlement_members enable row level security;
alter table public.chat_messages enable row level security;
create index idx_chat_messages_settlement_id on public.chat_messages(settlement_id);
create index idx_expenses_settlement_id on public.expenses(settlement_id);
create index idx_expenses_user_id on public.expenses(user_id);
create index idx_settlement_members_settlement_id on public.settlement_members(settlement_id);
create index idx_settlement_members_user_id on public.settlement_members(user_id);
`;

const FUNCTIONS = [
  'delete_user',
  'get_my_admin_pin',
  'get_public_settlement_by_invite_code',
  'get_settlement_id_by_invite_code',
  'join_settlement_by_invite_code',
  'kick_member',
  'set_my_admin_pin'
]
  .map(
    (name) => `
create or replace function public.${name}()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform 1;
end;
$function$;
`
  )
  .join('\n');

test('SQL splitter keeps semicolons inside function bodies', () => {
  const statements = splitSqlStatements(`
    create function public.example() returns void language plpgsql as $$
    begin
      perform 1;
      perform 2;
    end;
    $$;
    select 1;
  `);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /perform 2;/);
  assert.match(statements[1], /select 1/);
});

test('secure baseline has no high or critical findings', () => {
  const result = auditSchema(`
    ${TABLES}
    ${FUNCTIONS}
    create policy "Owner read"
      on public.settlements for select to authenticated
      using (auth.uid() = user_id);
    create policy "Profiles are publicly readable"
      on public.profiles for select to anon, authenticated
      using (true);
    grant select (user_id, nickname, created_at)
      on table public.profiles to anon;
    grant execute on function public.get_public_settlement_by_invite_code()
      to anon;
  `);

  assert.equal(result.summary.critical, 0);
  assert.equal(result.summary.high, 0);
});

test('detects broad public policies, grants, RPC access, and unsafe search_path', () => {
  const result = auditSchema(`
    ${TABLES}
    ${FUNCTIONS}
    create policy "Public full access"
      on public.expenses using (true);
    grant all on table public.profiles to anon;
    grant all on function public.delete_user() to anon;
    create or replace function public.unsafe_admin()
    returns void language plpgsql security definer
    set search_path to 'public'
    as $$ begin perform 1; end; $$;
  `);

  const codes = new Set(result.findings.map((finding) => finding.code));
  assert.ok(codes.has('PUBLIC_UNCONDITIONAL_POLICY'));
  assert.ok(codes.has('PUBLIC_TABLE_GRANT'));
  assert.ok(codes.has('PRIVATE_RPC_PUBLIC_EXECUTE'));
  assert.ok(codes.has('UNSAFE_SECURITY_DEFINER_SEARCH_PATH'));
  assert.ok(result.summary.critical >= 3);
  assert.ok(result.summary.high >= 1);
});

test('reports object drift without embedding absolute paths', () => {
  const result = auditSchema(
    `${TABLES}${FUNCTIONS}`,
    `${TABLES}${FUNCTIONS}create index baseline_only on public.expenses(amount);`
  );
  const report = formatAuditReport(result, 'schema.sql', 'baseline.sql');

  assert.deepEqual(result.drift.missingIndexes, ['baseline_only']);
  assert.match(report, /Source: `schema\.sql`/);
  assert.match(report, /Missing indexes: `baseline_only`/);
  assert.doesNotMatch(report, /\/Users\//);
});
