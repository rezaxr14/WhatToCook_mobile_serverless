# Operations runbook

Operational procedures for the serverless Supabase backend. For the HTTP contract see
[`api.md`](./api.md); for schema and environment details see [`SUPABASE.md`](./SUPABASE.md).

The M4 AI gateway has four Edge Functions:

| Function               | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `generate-recipe`      | suggestions, recipe detail, sous-chef chat, streamed recipe |
| `scan-pantry`          | fridge/pantry photo extraction                              |
| `suggest-substitution` | ingredient substitutions                                    |
| `ai-models`            | public provider/model catalog for the client selector       |

The three AI functions use `supabase/functions/_shared/gateway.ts` for auth, CORS, quota, cache,
pricing, provider dispatch, and error mapping. `ai-models` is public and reads only the config
plus the LM Studio status; it exposes no secrets. `verify_jwt = false` is intentional for all
four: preflight must reach the shared layer, and `_shared/auth.ts` rejects every non-`OPTIONS`
request to the AI functions without a valid user token.

## 1. Local stack and functions

Docker is optional day to day (ADR-006). Start it only when testing Postgres, Storage, or Edge
Functions locally.

```powershell
pnpm supabase:start
pnpm supabase:reset                     # migrations + seed + Storage images
pnpm supabase:test                      # pgTAP
pnpm exec supabase functions serve --env-file supabase/functions/.env --no-verify-jwt
```

`supabase/functions/.env` is gitignored. It needs:

```dotenv
AI_PROVIDER=fake
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
# GEMINI_API_KEY=...        # only when testing the Gemini provider
# GEMINI_MODEL=...
# GEMINI_VISION_MODEL=...
# OPENROUTER_API_KEY=...    # only when AI_PROVIDER=openrouter
# OPENROUTER_MODEL=...      # example: openai/gpt-4o-mini
# OPENROUTER_VISION_MODEL=... # optional; defaults to OPENROUTER_MODEL
# LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1  # only when AI_PROVIDER=lmstudio
# LMSTUDIO_MODEL=...        # exact id from `lms ls`
# Global provider request guards; blank disables them.
# AI_RPM_LIMIT=20
# AI_RPD_LIMIT=200
```

To exercise AI without a hosted provider, run LM Studio locally instead of Docker while testing:
it serves an OpenAI-compatible API and local models are billed at $0. Stop the Supabase stack
first (`pnpm exec supabase stop`) to free RAM, then `lms server start`.

```dotenv
AI_PROVIDER=lmstudio
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL=gemma-4-e4b-uncensored-hauhaucs-aggressive
# LMSTUDIO_JSON_MODE=false  # LM Studio rejects json_object; structured calls rely on validation
```

The CLI injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into the
runtime. The shared client accepts the current `SUPABASE_PUBLISHABLE_KEY` /
`SUPABASE_SECRET_KEY` names too. Keep `AI_PROVIDER=fake` for routine local work: it is
deterministic and zero-cost.

### Deno checks

```powershell
pnpm dlx deno check --config supabase/functions/deno.json `
  supabase/functions/generate-recipe/index.ts `
  supabase/functions/scan-pantry/index.ts `
  supabase/functions/suggest-substitution/index.ts `
  supabase/functions/ai-models/index.ts

pnpm dlx deno test --config supabase/functions/deno.json `
  --allow-env --allow-net --allow-read supabase/functions/tests
```

### Local bearer token

Functions require a real Supabase user JWT even locally. The simplest source is an anonymous
sign-in with the local publishable key:

```powershell
$base = 'http://127.0.0.1:54321'
$key = '<local publishable or anon key from supabase status>'
$session = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/signup" `
  -Headers @{ apikey = $key; 'Content-Type' = 'application/json' } -Body '{}'
$token = $session.access_token
```

Then call a function with `Authorization: Bearer $token`. Store the token only in the shell; it
expires after an hour.

### Local smoke checklist

Run each item with the fake provider:

- [ ] `suggestions` returns five deterministic recipes and `provider: "fake"`.
- [ ] `detail` returns a validated recipe object.
- [ ] `chat` returns a non-empty reply.
- [ ] `stream` returns formatted recipe text.
- [ ] `stream: true` on `detail` returns `meta` -> `delta`* -> `final` NDJSON.
- [ ] `scan-pantry` returns catalog matches, with unmatched items as `matched: false`.
- [ ] `suggest-substitution` returns substitutes and a tip.
- [ ] A repeat with the same `Idempotency-Key` returns `duplicate: true` and zero usage.
- [ ] A repeat with the same payload but a new key returns `cached: true` and zero usage.
- [ ] A request without `Authorization` returns `401 unauthorized`.
- [ ] A browser request with a non-allowlisted `Origin` returns `403 origin_not_allowed`.
- [ ] `ai_usage_events` has settled provider calls and `cache_hit=true` rows for reused output;
      cache hits are excluded from daily/monthly counters.

Useful SQL while the local stack is running:

```powershell
docker exec supabase_db_<project-ref> psql -U postgres -d postgres -c `
  "select feature,status,cache_hit,provider,model,input_tokens,output_tokens,cost_micro_usd "
  "from ai_usage_events order by created_at desc limit 20;"
```

## 2. Staging deployment

Load the gitignored root `.env.local` (see `.env.example` for the PowerShell loader), then link
and verify the migration. Never paste the access token, database password, or provider key into a
command that is committed or shared.

```powershell
pnpm exec supabase link --project-ref $env:SUPABASE_PROJECT_ID
pnpm exec supabase db push --dry-run      # review the pending migration
pnpm exec supabase db push --yes

pnpm exec supabase secrets set AI_PROVIDER=fake `
  "ALLOWED_ORIGINS=https://<web-origin>,http://localhost:5173"

# To use OpenRouter instead, keep the same deploy flags and add:
# pnpm exec supabase secrets set AI_PROVIDER=openrouter
# pnpm exec supabase secrets set "OPENROUTER_API_KEY=$env:OPENROUTER_API_KEY"
# pnpm exec supabase secrets set "OPENROUTER_MODEL=$env:OPENROUTER_MODEL"
# LM Studio is local-only: hosted functions cannot reach your machine, so keep
# AI_PROVIDER=fake or openrouter in staging/prod and use lmstudio locally only.

pnpm exec supabase functions deploy generate-recipe --project-ref $env:SUPABASE_PROJECT_ID --no-verify-jwt
pnpm exec supabase functions deploy scan-pantry --project-ref $env:SUPABASE_PROJECT_ID --no-verify-jwt
pnpm exec supabase functions deploy suggest-substitution --project-ref $env:SUPABASE_PROJECT_ID --no-verify-jwt
pnpm exec supabase functions deploy ai-models --project-ref $env:SUPABASE_PROJECT_ID --no-verify-jwt
```

`verify_jwt = false` is also committed in `supabase/config.toml`; the explicit flag keeps the
deploy independent of CLI defaults. Re-run the local smoke checklist against the staging URL.
`supabase secrets list` shows digests, not values. The web bundle never receives
`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or any server-only variable.

### Applying the M4 migration

`20261022100000_ai_gateway.sql` is additive and does the following:

- Adds active `gemini` prices and routing for suggestions, recipe, chat, stream, and scan.
- Adds the `substitution` plan feature and feature flag.
- Adds `record_ai_cache_hit(text)`, service-role only.
- Excludes `cache_hit` events from `reserve_ai_quota()` daily/monthly counts.
- Adds `v_ai_spend_daily`, `v_ai_spend_by_user`, and `v_ai_cache_hit_rate`.

Check it applied:

```sql
select version, name from supabase_migrations.schema_migrations
order by version desc limit 3;

select provider, model, input_micro_usd_per_million, output_micro_usd_per_million, active
from ai_model_prices
where provider = 'gemini'
order by model;
```

## 3. Real Gemini enablement

Real traffic is **not enabled** until a key is stored server-side and the model ids/prices below
are verified against current Google documentation. The historical M1 price row uses provider
`google`; runtime requests use provider `gemini`.

Planned routing and active M4 rows:

| Feature                    | Model                   | Input / output micro-USD per 1M tokens |
| -------------------------- | ----------------------- | -------------------------------------- |
| suggestions, substitution  | `gemini-2.5-flash-lite` | 100,000 / 400,000                      |
| detail, chat, stream, scan | `gemini-2.5-flash`      | 300,000 / 2,500,000                    |
| fallback text/vision       | `gemini-2.0-flash`      | 100,000 / 400,000                      |
| fallback (not default)     | `gemini-2.5-pro`        | 1,250,000 / 10,000,000                 |

Before enabling:

1. Confirm each model id is available to the project and the active prices are correct.
2. Add `GEMINI_API_KEY` as a Supabase function secret, without echoing it:
   ```powershell
   pnpm exec supabase secrets set "GEMINI_API_KEY=$env:GEMINI_API_KEY"
   ```
   The key belongs in the root `.env.local` / `supabase/functions/.env` locally, or in Supabase
   secrets remotely. It must never appear in `VITE_*` or `EXPO_PUBLIC_*`.
3. Set a deliberately low global cap before the first call:
   ```sql
   update app_config
   set global_daily_cap_micro_usd = 50000   -- USD 0.05/day
   where id = 1;
   ```
4. Set `AI_PROVIDER=gemini` and redeploy/restart the functions.
5. Call one request per feature and record: HTTP status, provider/model, token counts, cost,
   latency (`Measure-Command` or the browser network panel), and any `rate_limited_models`.
6. Verify `ai_usage_events` has settled rows with non-zero input/output tokens and the expected
   micro-USD cost, and that `get_my_usage()` reflects the spend.
7. Raise the cap only after the first-day totals match the budget model.

If the provider returns `429`, the client sees `429 rate_limited`; do not retry more than once
without checking the provider quota. If the provider returns `502 provider_error`, check the
function logs for `gemini_http_<status>` and the model/pricing configuration.

## 4. OpenRouter enablement

OpenRouter is the second real provider. It uses the OpenAI-compatible chat-completions API, so
the same adapter covers text, structured JSON, streaming, and vision. The key is read only in the
Edge Function process; it must never be exposed through `VITE_*` or `EXPO_PUBLIC_*`.

1. Put the key and model id in the root `.env.local` and in `supabase/functions/.env`:
   ```dotenv
   AI_PROVIDER=openrouter
   OPENROUTER_API_KEY=...
   OPENROUTER_MODEL=openai/gpt-4o-mini
   # Optional multimodal model for pantry scans:
   # OPENROUTER_VISION_MODEL=openai/gpt-4o
   ```
   The model id is the exact id from <https://openrouter.ai/models>. `OPENROUTER_MODEL` is used
   for every feature, including scans, unless `OPENROUTER_VISION_MODEL` is set. If the model is
   text-only, set a multimodal vision model or disable the `scan` feature flag.
2. Set a deliberately low global cap before the first call, as in the Gemini procedure:
   ```sql
   update app_config
   set global_daily_cap_micro_usd = 50000   -- USD 0.05/day
   where id = 1;
   ```
3. Restart the local functions:
   ```powershell
   pnpm exec supabase functions serve --env-file supabase/functions/.env --no-verify-jwt
   ```
   For staging, set secrets instead of editing a file on the server:
   ```powershell
   pnpm exec supabase secrets set AI_PROVIDER=openrouter
   pnpm exec supabase secrets set "OPENROUTER_API_KEY=$env:OPENROUTER_API_KEY"
   pnpm exec supabase secrets set "OPENROUTER_MODEL=$env:OPENROUTER_MODEL"
   # Optional: match the RPM/RPD shown for your OpenRouter model.
   # pnpm exec supabase secrets set AI_RPM_LIMIT=... AI_RPD_LIMIT=...
   ```
4. Pricing: the gateway first looks for an active `ai_model_prices` row for
   `provider='openrouter'` and the exact model. If none exists, it uses the conservative
   defaults `OPENROUTER_INPUT_MICRO_USD_PER_MILLION=1000000` /
   `OPENROUTER_OUTPUT_MICRO_USD_PER_MILLION=3000000` (USD 1 / USD 3 per 1M tokens). These are
   estimates; set the env overrides or insert the model's current price before production
   traffic.
5. Run one low-cost request per feature and verify `provider: "openrouter"`, the exact
   `model_used`, token counts, and `ai_usage_events` cost. Remember that the gateway ignores a
   client-supplied `provider`/`model`; routing is server-side.
6. If the model rejects `response_format`, set `OPENROUTER_JSON_MODE=false` and restart. If a
   model is unavailable or rate-limited, add a fallback:
   ```dotenv
   OPENROUTER_FALLBACK_MODELS=openai/gpt-4.1-mini,openai/gpt-4o-mini
   ```
7. OpenRouter free tiers also publish RPM/RPD limits. Mirror them with `AI_RPM_LIMIT` and
   `AI_RPD_LIMIT` so the gateway rejects excess traffic before calling the provider. Both are
   global across users, count actual provider attempts (not cache hits or idempotent replays),
   and are disabled when blank. RPM overflows return `429 rate_limited`; RPD overflows return
   `429 quota_exceeded` with `resets_at` at the next UTC midnight.

To switch back, set `AI_PROVIDER=gemini` (with `GEMINI_API_KEY`) or `AI_PROVIDER=fake` and
restart/redeploy. Cache keys include the provider and model, so switching providers does not
reuse the previous provider's responses.

## 5. Kill switch and feature flags

All flags are in `public.app_config` (id = 1). Changes take effect on the next request.

```sql
-- Stop all AI traffic immediately
update app_config set ai_kill_switch = true where id = 1;

-- Disable one feature
update app_config
set feature_flags = jsonb_set(feature_flags, '{scan}', 'false'::jsonb, true)
where id = 1;

-- Open the global budget circuit breaker
update app_config set global_daily_cap_micro_usd = 0 where id = 1;

-- Inspect current configuration
select ai_kill_switch, global_daily_cap_micro_usd, feature_flags, model_routing
from app_config where id = 1;
```

`ai_disabled` (503) means the kill switch or a feature flag is off. `ai_budget_exhausted` (503)
means the global daily cap is reached. A disabled feature also stops cache hits, so re-enable the
flag before investigating client reports.

## 6. Usage, quota, and cache

The service-role gateway owns `reserve_ai_quota`, `settle_ai_usage`, `refund_ai_usage`, and
`record_ai_cache_hit`. Clients can only call `get_my_usage()` for their own profile.

```sql
-- Recent events (service role / SQL editor)
select created_at, user_id, feature, status, cache_hit, provider, model,
       input_tokens, output_tokens, cost_micro_usd, error_code
from ai_usage_events
order by created_at desc
limit 50;

-- Daily spend and cache rate
select * from v_ai_spend_daily order by day desc, feature;
select * from v_ai_cache_hit_rate order by day desc, feature;

-- Per-user spend
select * from v_ai_spend_by_user order by last_request_at desc;

-- Current counters
select * from ai_usage_counters where user_id = '<user-id>';
```

Cache behavior:

- Normal cache: 7-day TTL; `force_refresh: true` skips the read but still writes.
- Idempotency cache: 24-hour TTL; a repeat returns `duplicate: true`.
- A normal cache hit inserts a zero-cost `cache_hit=true` event and increments
  `ai_response_cache.hit_count`; it does not consume daily/monthly quota.
- An idempotent retry returns the original event and does not insert a second usage row.
- If the idempotency response expired but the settled event remains, the gateway returns
  `409 duplicate_request` instead of charging again.

Purge only expired cache rows during normal operation:

```sql
delete from ai_response_cache where expires_at < now();
```

Purging a live cache entry is safe but forces the next request to call the provider. To recover a
stuck `reserved` event, inspect it first and refund only when no provider response was settled:

```sql
select * from ai_usage_events where status = 'reserved' order by created_at;
select refund_ai_usage('<event-id>', 'manual_recovery');
```

## 7. Error triage

| Symptom                    | Check                                                                                                                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401 unauthorized`         | Bearer token missing/expired; local token expires hourly. `verify_jwt=false` does not mean anonymous access.                                                                                                                                                                                                    |
| `403 origin_not_allowed`   | Exact scheme/host/port in `ALLOWED_ORIGINS`; native apps send no `Origin`. In PowerShell quote the whole `ALLOWED_ORIGINS=...` argument, otherwise the comma is parsed as an array and the CLI stores a space-separated value. The parser accepts both commas and whitespace, but use the canonical comma form. |
| `413 payload_too_large`    | JSON > 64 KiB or scan body > 20 MiB; decoded image > plan cap.                                                                                                                                                                                                                                                  |
| `429 quota_exceeded`       | `ai_usage_counters`, plan feature limits, monthly budget. Cache hits do not count.                                                                                                                                                                                                                              |
| `429 rate_limited`         | Provider rate limit; respect `Retry-After`.                                                                                                                                                                                                                                                                     |
| `503 ai_disabled`          | `ai_kill_switch` or `feature_flags`.                                                                                                                                                                                                                                                                            |
| `503 ai_budget_exhausted`  | `global_daily_cap_micro_usd` / `ai_global_daily`.                                                                                                                                                                                                                                                               |
| `502 provider_error`       | Missing/invalid key, model id, price row, provider outage, or timeout.                                                                                                                                                                                                                                          |
| `502 invalid_model_output` | Provider JSON failed schema validation twice; inspect the prompt/schema.                                                                                                                                                                                                                                        |
| `500 internal_error`       | Service-role configuration, DB/RLS, or an unexpected gateway error.                                                                                                                                                                                                                                             |

Function logs:

```powershell
pnpm exec supabase functions logs generate-recipe --project-ref $env:SUPABASE_PROJECT_ID
```

The Supabase dashboard's Edge Functions log view is equivalent. Do not paste full logs containing
user content into public issues.

## 8. Rollback

1. Set `ai_kill_switch = true`.
2. Redeploy the last known-good commit for the affected function:
   ```powershell
   pnpm exec supabase functions deploy <name> --project-ref $env:SUPABASE_PROJECT_ID --no-verify-jwt
   ```
   from a checkout of that commit.
3. Migration `20261022100000_ai_gateway.sql` is additive. Do not edit an applied migration;
   write a new forward migration if a schema change must be reverted.
4. Keep the cache unless the rollback changes response shape. If it does, purge
   `ai_response_cache` before re-enabling traffic.
5. Re-enable the kill switch only after the smoke checklist passes.

## 9. M4 verification record

Local fake-provider smoke on 2026-10-22 (Supabase CLI 2.121.0, Deno 2.9.6):

- `suggestions`, `detail`, `chat`, `stream`, `scan-pantry`, and `suggest-substitution` returned
  HTTP 200 with `provider: "fake"` and zero cost.
- `detail` with `stream: true` returned `application/x-ndjson` with `meta` -> 2 `delta` events
  -> `final`.
- `chat` with `stream: true` returned `meta` -> deltas -> `final`.
- A scan reported 5 raw detections and returned 4 catalog-matched items; the 0.3-confidence
  detection was filtered by `min_confidence: 0.5` before catalog matching.
- Repeating a substitution with the same `Idempotency-Key` returned `cached: true`,
  `duplicate: true`, and zero usage.
- Repeating the same scan payload with a new key returned `cached: true`, `duplicate: false`,
  and zero usage.
- A missing bearer token returned 401; `Origin: https://evil.example` returned 403.
- `ai_usage_events` showed settled provider calls plus zero-cost `cache_hit` rows. The cache hits
  did not reduce the daily scan allowance (one billed scan, remaining 2 for an anonymous plan).
- Deno type-check and tests passed; pgTAP and `db lint` passed locally before deployment.

Staging smoke on 2026-10-22 (project `lderdvhteofqemiivosz`, `AI_PROVIDER=fake`):

- Applied `20261022100000_ai_gateway.sql`; migration history now ends at `ai_gateway`.
- Defined `AI_PROVIDER=fake` and `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`
  as function secrets; deployed `generate-recipe`, `scan-pantry` and
  `suggest-substitution` with `verify_jwt=false`.
- Every function returned 200: suggestions (5 recipes), detail (2 steps), chat (reply),
  detail stream (`meta` -> 2 deltas -> `final`), scan (5 raw / 4 catalog matches), and
  substitution (2 substitutes). All reported `provider: "fake"` and zero cost.
- Measured end-to-end times were 1.3-3.9 s and include staging cold starts; these are not
  provider latency numbers and must not be used for Gemini budgeting.
- CORS preflight for `http://localhost:5173` returned 204 with the matching
  `Access-Control-Allow-Origin`; a POST with that `Origin` returned 200 with the CORS header,
  while `Origin: https://evil.example` returned 403. The first secret write used an unquoted
  PowerShell comma, so the CLI stored a space-separated value; the parser now accepts both
  commas and whitespace, and the secret was re-written in the canonical quoted comma form.
- Same-key retries returned `duplicate: true`; a new-key repeat returned `cached: true` with
  zero usage. A missing token returned 401.
- `ai_kill_switch=true` returned `503 ai_disabled` immediately; it was reset to false.
- Staging DB checks showed settled usage rows with `provider=fake`, zero token cost,
  zero-cost `cache_hit` rows, and `ai_usage_counters` counting one scan after a scan plus a
  cache hit. `v_ai_spend_daily` and `v_ai_cache_hit_rate` populated correctly.
- All test anonymous users were deleted and the staging response cache was purged after the
  smoke.

Real Gemini smoke remains blocked on H5. The Gemini key field is blank; real traffic must not be
enabled until the key is present and the model/pricing rows are verified against current Google
documentation. The planned M4 prices are listed in section 3.
