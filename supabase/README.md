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
