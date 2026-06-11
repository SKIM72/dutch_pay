# Local database security checks

This directory is an isolated Supabase project for schema and security tests.
It is not linked to the production project.

## Production safety rule

Do not run `supabase link`, `supabase db push`, or `supabase migration up --linked`
from this repository until the local baseline has been compared with a fresh
production schema dump and explicitly approved.

## Run locally

Start Docker Desktop, then run:

```bash
npm run db:start:test
npm run db:reset:test
npm run test:db
npm run db:stop
```

The tests create fixtures inside transactions and roll them back. They verify:

- RLS is enabled on every application table.
- Anonymous users cannot query settlement, expense, member, or chat tables.
- Public invite preview exposes only the approved read-only JSON shape.
- Destructive and private RPCs are unavailable to anonymous users.
- Owners, joined members, outsiders, joining users, and removed members have
  the expected access.
- `profiles.admin_pin` is accessible only through the authenticated user's own
  RPC calls.

## Read-only production schema audit

Create a fresh schema-only dump in a directory outside this repository. Never
commit a production dump because it can reveal internal policy and function
details.

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$BACKUP_DIR/schema.sql"
```

Audit the dump against the local security baseline:

```bash
npm run db:audit:schema -- \
  "$BACKUP_DIR/schema.sql" \
  --baseline supabase/migrations/20260611130000_local_security_baseline.sql \
  --output "$BACKUP_DIR/schema-audit.md"
```

The audit reads SQL files only. It never opens a database connection and never
executes SQL. It exits with code `2` when critical or high findings exist.
Use `--fail-on none` when reviewing a known historical dump.

The report checks:

- required application tables, columns, RLS, RPCs, and indexes;
- unconditional public or authenticated RLS policies;
- broad anonymous table and default privileges;
- anonymous access to private/destructive RPCs;
- unsafe `SECURITY DEFINER` search paths;
- table, function, policy, and index drift from the local baseline.
