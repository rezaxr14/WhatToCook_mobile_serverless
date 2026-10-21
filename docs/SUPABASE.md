# Supabase runbook

Project: `WhatToCook` (`lderdvhteofqemiivosz`, `eu-west-1`, Postgres 17.11)
URL: `https://lderdvhteofqemiivosz.supabase.co`

The public catalog lives in a migration, not `seed.sql`, so staging receives it through
`supabase db push`. See ADR-008 for the deployment decisions.

## Local stack

Docker is optional day to day (ADR-006). Start it only when local Postgres/Storage/pgTAP is
needed.

```bash
pnpm supabase:start       # start local stack (Docker)
pnpm supabase:reset       # reapply migrations, seed, and Storage images
pnpm supabase:test        # pgTAP suite (102 tests)
pnpm gen:types            # regenerate shared types from the local DB
```

Local endpoints: API `http://127.0.0.1:54321`, DB `127.0.0.1:54322`, Studio
`http://127.0.0.1:54323`.

Seeded catalog: 80 ingredients, 12 recipes, 65 recipe-ingredient rows, 3 plans. The 12 JPGs in
`supabase/seed-images/recipes/` are uploaded by the local stack to
`recipe-images/recipes/<file>` when `objects_path` is configured in `supabase/config.toml`.

## Environment and secrets

The committed templates are:

- `.env.example` - full environment contract: Supabase CLI/CI, web, mobile, and
  server-only Edge Function values.
- `apps/web/.env.example` - the public Vite values only.

For local CLI/CI work, copy `.env.example` to `.env.local` and fill in
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, and `SUPABASE_DB_PASSWORD`. `.env.local` is
gitignored. The same three names are stored in the GitHub `staging` environment, which the
deploy job references:

```bash
gh secret list --env staging
```

The project database password was rotated on 2026-10-22 so CI can link and push without a
human. If it is rotated again, update both `.env.local` and the `SUPABASE_DB_PASSWORD`
environment secret. `supabase link --project-ref lderdvhteofqemiivosz` followed by
`supabase db push --dry-run` verifies the new password; the dry run should report
`Remote database is up to date`.

The web client reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_ENV` from
`apps/web/.env.local`. The mobile client (M2+) reads `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` from `apps/mobile/.env.local`. These are public by design;
never put a service-role or provider key in either prefix.

## Schema and tests

Migrations, in order:

1. `core_schema.sql` - tables, constraints, indexes, profile trigger
2. `rls_policies.sql` - grants, RLS policies, Storage policies
3. `quota_and_match.sql` - `can_cook()`, `seed_demo_data()`, quota RPCs, `get_my_usage()`
4. `catalog_seed.sql` - plans, app config, prices, 80/12/65 catalog rows, buckets
5. `hardening.sql` - helper-function revokes and server-only deny policies

pgTAP coverage:

- `000_schema.test.sql` - tables, seed counts, rounding, functions, buckets
- `001_rls.test.sql` - cross-user isolation, catalog read-only, grants, demo flow, deletion
- `002_quota.test.sql` - reserve/idempotency/settle/refund/limits/usage
- `003_concurrency.test.sql` - two simultaneous reservations cannot exceed the limit
- `004_hardening.test.sql` - helper RPC revokes and deny policies

`db lint` must stay clean:

```bash
pnpm exec supabase db lint --local --schema public --level warning --fail-on error
```

## Staging

`.github/workflows/supabase.yml` runs the local schema/pgTAP checks on pull requests and, on
`main`, deploys when these `staging` environment secrets exist:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID` (`lderdvhteofqemiivosz`)
- `SUPABASE_DB_PASSWORD`

It runs `supabase link`, `supabase db push --yes`, then uploads each catalog image to
`recipe-images`. Storage uploads remove the object first because `storage cp` is experimental
and does not upsert. Missing secrets produce a warning and skip the deploy.

**Deploy-path decision:** this workflow is the single owner of staging and production
migrations. The Supabase GitHub integration is connected (`Supabase Preview` appears on pull
requests and currently skips) but is allowed only for preview branches; its production deploy
must remain off so it cannot race the workflow. If preview branching is enabled later, preview
branches may deploy independently.

Use `supabase gen types typescript --project-id lderdvhteofqemiivosz --schema public` when the
committed types must match staging exactly.

### One-off remote changes

Prefer the CI push, or a local `supabase db push` using the password in `.env.local`. The
Supabase MCP is now a last-resort fallback. MCP creates its own timestamped version in
`supabase_migrations.schema_migrations`; after applying with MCP, align the remote history to
the local migration versions (delete the MCP version and insert the local version) or the next
`db push` will try to reapply the migration. For M1 the history is already aligned and the dry
run reports up to date.

### Storage

```bash
pnpm exec supabase storage cp <file> "ss:///recipe-images/recipes/<name>" \
  --project-ref lderdvhteofqemiivosz --experimental --yes
```

`recipe-images` is public-read; `scan-uploads` is private and owner-folder-scoped. Catalog
`image_path` values are `recipes/<file>.jpg`, and the objects live under the same `recipes/`
prefix in the bucket.

### Auth and demo

Anonymous sign-ins are enabled in local config and must stay enabled in staging Auth settings.
The demo flow is anonymous sign-in -> `seed_demo_data()` -> `can_cook()`. No shared demo account
or demo-pantry table exists. Expected demo result: 0 full / 9 partial / 11 pantry ingredients,
with Carbonara, Penne and Shakshuka excluded.

## Advisor exceptions

The remaining security advisor notices are intentional:

- `seed_demo_data()` and `delete_my_account_data()` are authenticated `SECURITY DEFINER` RPCs.
- Anonymous sign-ins cause policy notices on user tables; anonymous users use the
  `authenticated` role.
- `cron.job` notices belong to Supabase internals.

Trigger helpers are not callable by clients, and server-only AI tables have explicit deny
policies. Performance notices are unused indexes on a fresh database.
