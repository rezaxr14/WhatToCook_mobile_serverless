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
pnpm supabase:test        # pgTAP suite (120 tests)
pnpm gen:types            # regenerate shared types from the local DB

# Serve all four AI Edge Functions with the local fake provider
pnpm exec supabase functions serve --env-file supabase/functions/.env --no-verify-jwt
```

Local endpoints: API `http://127.0.0.1:54321`, DB `127.0.0.1:54322`, Studio
`http://127.0.0.1:54323`.

Seeded catalog: 80 ingredients, 12 recipes, 65 recipe-ingredient rows, 3 plans. The 12 JPGs in
`supabase/seed-images/recipes/` are uploaded by the local stack to
`recipe-images/recipes/<file>` when `objects_path` is configured in `supabase/config.toml`.
The 15 extra WebP photos in `supabase/seed-images/dishes/` give AI suggestions that have no
catalog recipe a real food image; they are uploaded to `recipe-images/dishes/<file>`.

## Environment and secrets

The committed templates are:

- `.env.example` - full environment contract: Supabase CLI/CI, web, mobile, and
  server-only Edge Function values.
- `apps/web/.env.example` - the public Vite values only.

For local CLI/CI work, copy `.env.example` to `.env.local` and fill in
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, and `SUPABASE_DB_PASSWORD`. `.env.local` is
gitignored and is not loaded automatically by the Supabase CLI. Load it in the shell
(`set -a; source .env.local; set +a` on bash, or the PowerShell loop in `.env.example`) or pass
`--password` explicitly. The same three names are stored in the GitHub `staging` environment,
which the deploy job references:

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

The Edge Functions read server-only values from `supabase/functions/.env` locally or from
Supabase secrets remotely:

- `AI_PROVIDER` - `fake` (default for tests/staging), `gemini`, `openrouter`, or `lmstudio`.
- `GEMINI_API_KEY` - required only when `AI_PROVIDER=gemini`.
- `GEMINI_MODEL` / `GEMINI_VISION_MODEL` - optional Gemini overrides; normal routing comes from
  `app_config.model_routing`. Gemini uses Flash-Lite only (`gemini-3.5-flash-lite` default,
  `gemini-3.1-flash-lite` fallback), and both are selectable in the client model picker.
- `OPENROUTER_API_KEY` - required when `AI_PROVIDER=openrouter` or `AI_FALLBACK_PROVIDER=openrouter`;
  server-side only.
- `AI_FALLBACK_PROVIDER` - optional `openrouter`; retries Gemini failures (before any streamed
  output) on `OPENROUTER_MODEL`. Free models cost $0. Off when empty.
- `AI_FALLBACK_VISION` - optional `true` to also send pantry photos to the fallback; off by
  default because free routers may not offer a vision model.
- `OPENROUTER_MODEL` - required when `AI_PROVIDER=openrouter`, and used by the fallback; one model
  id for all features. `openrouter/free` routes across free models.
- `OPENROUTER_VISION_MODEL` - optional scan override; defaults to `OPENROUTER_MODEL`.
- `OPENROUTER_ALLOWED_MODELS` - optional comma-separated allowlist for client-selected models;
  free `*:free` ids are always selectable.
- `OPENROUTER_FALLBACK_MODELS` / `OPENROUTER_VISION_FALLBACK_MODELS` - optional comma-separated
  OpenRouter model ids.
- `OPENROUTER_INPUT_MICRO_USD_PER_MILLION` / `OPENROUTER_OUTPUT_MICRO_USD_PER_MILLION` - optional
  pricing overrides; defaults are conservative estimates (1,000,000 / 3,000,000).
- `OPENROUTER_SITE_URL` / `OPENROUTER_APP_NAME` / `OPENROUTER_JSON_MODE` - optional request
  attribution and JSON-mode toggle.
- `LMSTUDIO_BASE_URL` - LM Studio OpenAI-compatible base URL; default `http://127.0.0.1:1234/v1`.
- `LMSTUDIO_MODEL` - required when `AI_PROVIDER=lmstudio`; one local model id for all features.
- `LMSTUDIO_VISION_MODEL` / `LMSTUDIO_FALLBACK_MODELS` / `LMSTUDIO_VISION_FALLBACK_MODELS` -
  optional local overrides and fallbacks.
- `LMSTUDIO_ALLOWED_MODELS` - optional comma-separated allowlist for client-selected local models.
- `LMSTUDIO_API_KEY` / `LMSTUDIO_JSON_MODE` / `LMSTUDIO_TIMEOUT_MS` /
  `LMSTUDIO_STREAM_TIMEOUT_MS` - optional local auth, JSON mode (off by default), and timeouts.
- `AI_RPM_LIMIT` / `AI_RPD_LIMIT` - optional global provider request guards (rolling minute and
  UTC day). Blank disables them; cache hits and idempotent replays are not counted.
- `ALLOWED_ORIGINS` - comma-separated browser origins for CORS. Origins are matched exactly
  (scheme, host and port) after trailing slashes are stripped; native mobile clients send no
  `Origin` and are allowed without an entry. Include every browser deployment, for example
  `https://rezaxr14.github.io,http://localhost:5173,http://127.0.0.1:5173`. A `*` entry allows
  any origin and is meant for local experiments only.

`supabase/functions/.env` is gitignored. The web bundle must contain none of these names or
values.

## Schema and tests

Migrations, in order:

1. `core_schema.sql` - tables, constraints, indexes, profile trigger
2. `rls_policies.sql` - grants, RLS policies, Storage policies
3. `quota_and_match.sql` - `can_cook()`, `seed_demo_data()`, quota RPCs, `get_my_usage()`
4. `catalog_seed.sql` - plans, app config, prices, 80/12/65 catalog rows, buckets
5. `hardening.sql` - helper-function revokes and server-only deny policies
6. `20261022100000_ai_gateway.sql` - Gemini prices/routing, substitution feature,
   cache-hit RPC and quota exclusion, AI spend/cache views

pgTAP coverage:

- `000_schema.test.sql` - tables, seed counts, rounding, functions, buckets
- `001_rls.test.sql` - cross-user isolation, catalog read-only, grants, demo flow, deletion
- `002_quota.test.sql` - reserve/idempotency/settle/refund/limits/usage
- `003_concurrency.test.sql` - two simultaneous reservations cannot exceed the limit
- `004_hardening.test.sql` - helper RPC revokes and deny policies
- `005_ai_gateway.test.sql` - substitution plans, routing/prices, cache-hit quota exclusion,
  cache-hit RPC, and admin views

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
`recipe-images` (`recipes/` and `dishes/`). Storage uploads remove the object first because
`storage cp` is experimental and does not upsert. Missing secrets produce a warning and skip the
deploy.

**Deploy-path decision:** this workflow is the single owner of staging and production
migrations. The Supabase GitHub integration is connected (`Supabase Preview` appears on pull
requests and currently skips) but is allowed only for preview branches; its production deploy
must remain off so it cannot race the workflow. If preview branching is enabled later, preview
branches may deploy independently.

### AI Edge Functions

The AI functions are deployed separately from the migration job. After `db push`, set the
server-only values and deploy all four:

```powershell
pnpm exec supabase secrets set AI_PROVIDER=fake `
  "ALLOWED_ORIGINS=https://<web-origin>,http://localhost:5173,http://127.0.0.1:5173"

pnpm exec supabase functions deploy generate-recipe --project-ref $env:SUPABASE_PROJECT_ID --no-verify-jwt
pnpm exec supabase functions deploy scan-pantry --project-ref $env:SUPABASE_PROJECT_ID --no-verify-jwt
pnpm exec supabase functions deploy suggest-substitution --project-ref $env:SUPABASE_PROJECT_ID --no-verify-jwt
pnpm exec supabase functions deploy ai-models --project-ref $env:SUPABASE_PROJECT_ID --no-verify-jwt
```

`AI_PROVIDER=fake` is the supported staging/test state: deterministic output and zero cost.
LM Studio is local-only and must not be set on hosted functions, which cannot reach a developer
machine. Staging currently has the M4 migration and all four functions deployed in this state, with
`ALLOWED_ORIGINS` set to the hosted GitHub Pages origin plus both local Vite origins
(`https://rezaxr14.github.io,http://localhost:5173,http://127.0.0.1:5173`). Real
Gemini traffic waits for H5 and a model/price review; OpenRouter traffic waits for
`OPENROUTER_API_KEY` and `OPENROUTER_MODEL`. Either provider key, when enabled, is a function
secret only; it never enters `VITE_*`, `EXPO_PUBLIC_*`, or the static bundle. The full deployment,
smoke, quota, cache, and rollback procedures live in [`runbook.md`](./runbook.md); the HTTP
contract is in [`api.md`](./api.md).

The shared gateway lives in `supabase/functions/_shared/`. `verify_jwt = false` is intentional
for all four functions so browser preflight reaches the shared auth/CORS layer; every
non-`OPTIONS` request to an AI function is still rejected without a valid user token, while
`ai-models` is intentionally public and exposes only provider/model metadata.

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
prefix in the bucket. AI-discovered dishes reuse those photos plus `dishes/<file>.webp`; both
clients resolve dishes through `packages/shared/src/dish-photos.ts` and only fall back to a local
poster when even Storage fails.

`ingredient-images` is also public-read. The `cache-ingredient-images` Edge Function fills it
with content-hashed thumbnails (`ingredients/<slug>-<hash>.<ext>`) and updates
`ingredients.image_path`; see the runbook for the manual refresh command and workflow.

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
