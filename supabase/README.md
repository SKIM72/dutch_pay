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

## Receipt OCR Edge Function

`functions/scan-receipt` accepts authenticated requests only and sends a
compressed receipt image to Gemini for Korean and Japanese OCR. The function
does not write receipt images to the database or Supabase Storage.

Before upload, the browser detects the bright receipt region, removes the
surrounding background, corrects perspective, and creates both a natural-color
JPEG and a grayscale text-enhanced JPEG. Auto-cropping is used only when the
document geometry passes a confidence threshold; uncertain images are sent to
the manual crop step. Camera and gallery images use the same preprocessing
path.

Both image views are compared in one Gemini request, so one scan still consumes
one API request. The structured response includes visible amount candidates,
their labels and classifications, exact evidence for the selected total,
field-level confidence, and warnings. Korean and Japanese subtotal, tax, cash
received, and change labels are explicitly excluded from the final paid amount.

Configure and deploy the function independently from database migrations:

```bash
supabase secrets set GEMINI_API_KEY="YOUR_KEY" --project-ref "<production-project-ref>"
supabase functions deploy scan-receipt --project-ref "<production-project-ref>"
```

`GEMINI_RECEIPT_MODEL` is optional and defaults to the stable
`gemini-2.5-flash` model. Never put `GEMINI_API_KEY` in `config.js`, browser
code, Git, or a database table. Deploying this Edge Function does not require
`supabase db push`.
