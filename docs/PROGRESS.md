# Progress

> Local, agent-maintained log. Update at the end of every milestone. The plan itself
> (`implementation_plan.md`) is untracked via `.git/info/exclude`.

## Current

**Milestone:** M4 - AI gateway and usage metering (implemented and deployed to staging with the fake provider; real Gemini smoke blocked on H5)

**Provider addendum (2026-10-22):** added a server-side OpenRouter adapter (text, structured JSON,
streaming, vision) with `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL`
routing. The key and model placeholders are in `.env.example`, `supabase/functions/.env.example`,
and the two gitignored local env files. Optional `AI_RPM_LIMIT` / `AI_RPD_LIMIT` env guards cap
global provider attempts per rolling minute and UTC day; blank disables them. The adapter and
rate-guard wiring are unit-tested; a real OpenRouter smoke waits for the key/model to be pasted
into the local env files.

## M0 checklist

- [x] Git repo initialized on `main`; plan excluded from version control
- [x] Bootstrap checks: Node 23.7.0, pnpm 12.14.0, git 2.53, gh (logged in), Docker 29.7
- [x] Section 3 skills/MCP review - 14 official skills installed (ADR-007)
- [x] pnpm workspace: `apps/web`, `packages/shared`
- [x] TypeScript strict base config, ESLint flat config, Prettier, EditorConfig
- [x] Placeholder web app builds (`@whattocook/web`)
- [x] Shared package with locale constants + tests
- [x] `docs/porting-notes.md` - backend, data model, matcher, seed, API and frontend analysis
- [x] `docs/DECISIONS.md`
- [x] CI skeleton + gitleaks
- [x] GitHub repo created (public), `main` pushed, CI green on `main`
- [x] Branch protection on `main` + Dependabot
- [x] First green CI run on a PR
- [x] `CLAUDE.md` (reviewed; keeps the plan untracked and points at project skills)

## M1 checklist

- [x] Supabase project `WhatToCook` (`lderdvhteofqemiivosz`, `eu-west-1`, Postgres 17.11)
- [x] Supabase CLI authenticated; project-local Supabase MCP configured in `opencode.json`
- [x] `supabase/config.toml`: Postgres 17, anonymous sign-ins, localhost redirects,
      `recipe-images` (public) / `scan-uploads` (private), analytics off, explicit grants,
      `auto_expose_new_tables = false`
- [x] Core schema: plans, profiles, ingredients, recipes, recipe ingredients, pantry,
      grocery, AI prices/events/counters/global daily/cache, app config
- [x] RLS + explicit grants: public catalog read, own-row user data, server-only AI tables,
      storage policies for both buckets
- [x] Matcher RPC `can_cook()` with exact semantics:
      `missing_count <= 2 OR match_pct >= 50`, 0% partials, banker's rounding
- [x] AI quota RPCs (`reserve_ai_quota`, `settle_ai_usage`, `refund_ai_usage`) and
      `get_my_usage()`; quota mutations are `service_role` only
- [x] Account deletion RPC and profile bootstrap trigger
- [x] Canonical catalog seed as a migration: 80 ingredients, 12 recipes, 65 joins
- [x] 12 catalog JPGs in `supabase/seed-images/recipes/`
- [x] pgTAP suite: 102 tests across schema, RLS, quota, concurrency, hardening
- [x] `supabase db lint --local --schema public --level warning --fail-on error` clean
- [x] Generated `packages/shared/src/database.types.ts` from staging
- [x] Staging migrations applied; migration history aligned to local versions
- [x] Staging Storage: 12 catalog images in `recipe-images`
- [x] Staging anonymous sign-ins enabled; demo flow verified
- [x] `.github/workflows/supabase.yml`: local schema/pgTAP on PRs; gated staging
      `db push` + image upload on `main`
- [x] `.env.example` and `apps/web/.env.example`; deploy secrets in the GitHub `staging`
      environment and mirrored in the gitignored root `.env.local`

## WM1 checklist (web parity)

- [x] Reference React/Vite UI copied from the read-only reference repo
- [x] UI copy, modals and landing page restored to reference parity (no custom M4/M10 banners)
- [x] Supabase client + generated `Database` types
- [x] Auth: email/password, sign-up, anonymous guest demo with `seed_demo_data()`
- [x] Catalog: recipes, ingredients, recipe detail, Storage image URLs
- [x] Pantry: `pantry_items` CRUD under RLS
- [x] Matcher: `can_cook()` RPC with real totals on Recipes and Can Cook
- [x] Grocery list: `grocery_items` sync, localStorage fallback, source recipe
- [x] AI pages ported with a graceful `ai_not_ready` state until M4
- [x] Telegram modal uses the reference UI; its link endpoint is deferred to M10
- [x] Typecheck, lint, tests and production build green
- [x] Headless browser smoke: catalog, guest demo, matcher, pantry, grocery sync

## M4 checklist (AI gateway)

- [x] Shared zod contracts, limits, error codes, NDJSON schemas and token/cache helpers in
      `packages/shared/src/ai-contracts.ts`
- [x] `_shared/` auth, CORS, config, quota, cache, prices, prompts, catalog, validation, NDJSON,
      HTTP, provider dispatch, image sanitization
- [x] Provider interface with deterministic `fake`, Gemini REST, and OpenRouter adapters (text,
      structured, stream, vision; fallback model ladder and SSE parsing)
- [x] Optional global `AI_RPM_LIMIT` / `AI_RPD_LIMIT` guards checked before reservation
- [x] `generate-recipe` suggestions/detail/chat/stream modes, including NDJSON
- [x] `scan-pantry` with magic-byte checks, EXIF/XMP/IPTC stripping, plan image caps and catalog
      mapping; image is never persisted
- [x] `suggest-substitution` with its own plan feature
- [x] Prompt-injection hygiene, strict schemas, one repair attempt, length caps
- [x] `20261022100000_ai_gateway.sql`: Gemini prices/routing, substitution feature, cache-hit
      RPC, quota-cache exclusion, `v_ai_spend_daily` / `v_ai_spend_by_user` /
      `v_ai_cache_hit_rate`
- [x] Deno tests: 60 passing across 8 files, including cache/idempotency, refunds, streaming,
      cancellation, auth/CORS, image and catalog cases, plus OpenRouter text/stream/vision/pricing
      and global RPM/RPD guards
- [x] pgTAP: 120 tests (new `005_ai_gateway.test.sql`), `db lint` clean
- [x] CI runs Deno check/lint/test in addition to typecheck/lint/test/build/pgTAP
- [x] Local fake-provider smoke for all three functions, idempotent retry, normal cache hit,
      401/403, usage rows and quota exclusion (see `docs/runbook.md`)
- [x] `docs/api.md` request/response/error contract and `docs/runbook.md` operations guide
- [x] Applied the M4 migration to staging and deployed all three functions with
      `AI_PROVIDER=fake`; staging smoke, idempotency, cache, 401/403 and kill-switch checks pass
- [ ] Real Gemini smoke with a low spend cap; record latency, tokens, cost and CPU time
- [ ] H5: provide `GEMINI_API_KEY` and verify the listed model IDs/prices against current
      Google documentation

## Staging verification (2026-10-22)

- Catalog counts: 80 ingredients / 12 recipes / 65 recipe-ingredient rows / 3 plans.
- Storage: 12 public recipe images under `recipe-images/recipes/`; every `recipes.image_path`
  resolves to an object.
- Anonymous sign-in + `seed_demo_data()` + `can_cook()`:
  - 0 full matches, 9 partial matches, 11 pantry ingredients.
  - Tuscan Chicken 80%, Fried Rice 71%, Shrimp 67%, Pancakes 67%, Crepes 57%,
    Grilled Cheese 50%, Omelette 50%, Avocado Toast 50%, Affogato 0%.
  - Carbonara, Penne and Shakshuka excluded.
- Web smoke: 12 recipe cards loaded from staging, Storage images returned 200,
  guest demo produced 11 pantry ingredients / 0 full / 9 partial matches, and
  "Add Missing" created 4 grocery items that persisted after a page reload.
- Test anonymous user deleted after verification; staging domain tables are empty again.
- Security advisors remaining are intentional: authenticated `seed_demo_data()` and
  `delete_my_account_data()` RPCs, and anonymous-sign-in policy notices.
- Performance advisor only reports unused indexes on a fresh, unqueried database.

## M4 local verification (2026-10-22)

- `pnpm dlx deno check --config supabase/functions/deno.json` passed for all three entrypoints;
  `pnpm dlx deno lint --config supabase/functions/deno.json supabase/functions` passed 34 files.
- `pnpm dlx deno test --config supabase/functions/deno.json --allow-env --allow-net
--allow-read supabase/functions/tests` passed 44 tests across 6 files.
- `supabase test db` passed 120 pgTAP tests; `005_ai_gateway.test.sql` covers substitution
  plans, model routing/prices, cache-hit quota exclusion, the cache-hit RPC, and admin views.
- `supabase db lint --local --schema public --level warning --fail-on error` reported no errors.
- Local `supabase functions serve` smoke with `AI_PROVIDER=fake`: suggestions, detail, chat,
  stream, scan and substitution all returned 200; detail/chat NDJSON produced `meta` -> deltas
  -> `final`; scan returned 5 raw detections / 4 catalog matches.
- Idempotent retry returned `duplicate: true` with zero usage; a normal cache hit returned
  `cached: true` with zero usage and did not consume the scan allowance. Missing auth returned
  401 and a disallowed `Origin` returned 403.
- Usage rows were settled with `provider=fake` and zero cost; cache-hit rows are visible in
  admin views and excluded from quota counters.
- Real Gemini smoke was still pending at this record; see `docs/runbook.md` for the exact
  procedure.

## M4 staging verification (2026-10-22)

- `supabase db push` applied `20261022100000_ai_gateway.sql`; staging history ends at
  `ai_gateway`.
- Function secrets `AI_PROVIDER=fake` and
  `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` are set. All three functions
  are deployed with `verify_jwt=false` and the shared auth guard.
- Staging smoke returned 200 for suggestions (5 recipes), detail (2 steps), chat, detail
  stream (`meta` -> 2 deltas -> `final`), scan (5 raw / 4 matched), and substitution (2
  substitutes); all reported `provider=fake`, zero cost. End-to-end time was 1.3-3.9 s
  including cold starts (not a Gemini latency measurement).
- CORS preflight for `http://localhost:5173` returned 204 and an allowed-origin POST returned
  200; disallowed origin -> 403. The initial secret write was split by PowerShell at the comma;
  `parseAllowedOrigins` now accepts comma or whitespace separators, and the secret was rewritten
  in the canonical quoted form.
- Same-key retry returned `duplicate: true`; new-key repeat returned `cached: true` with zero
  usage. Missing token -> 401; `ai_kill_switch=true` -> 503 `ai_disabled`, then reset to false.
- Staging usage rows and counters were correct: a scan plus a cache hit counted one scan; cache
  hits remained visible in the admin views but did not consume quota.
- Test anonymous users were deleted and the staging response cache was purged after the smoke.
- Real Gemini smoke remains blocked on H5 and manual model/price verification.

## Model selector, free OpenRouter, and LM Studio (2026-10-22)

- Added a shared free-model catalog (`packages/shared/src/ai-models.ts`) and an
  `OPENROUTER_ALLOWED_MODELS` allowlist so the client selector can offer free
  OpenRouter models without letting a client choice raise the AI budget. Unknown
  or paid client models fall back to the server-routed model.
- Added the `lmstudio` provider id and reused the OpenAI-compatible OpenRouter
  adapter with a configurable base URL, optional key, and provider id. Local
  models are priced at $0. LM Studio rejects `response_format: json_object`, so
  JSON mode is off by default and structured calls rely on the shared JSON
  repair/validation.
- Added a public `ai-models` Edge Function that returns the active provider, the
  LM Studio online state, and the allowed model catalog. The web
  `aiApi.getProviders`/`getModels` call it once per session and fall back to the
  static OpenRouter catalog when it is not deployed.
- Verified the LM Studio provider independently (`lms server start`, model
  `gemma-4-e4b-uncensored-hauhaucs-aggressive`): text, structured JSON, stream,
  and the real `suggestions` schema all succeeded; the suggestions response
  validated on the first attempt. Docker was stopped first to free RAM.
- Deno suite passes 70 tests across 9 files; `deno check`, `deno lint`, and the
  workspace `typecheck`/`lint`/`test`/`build:web` are re-run after this change.

## Environment notes

- Supabase CLI 2.121.0 is a root dev dependency; use `pnpm exec supabase` or the root scripts.
- `GEMINI_API_KEY` and `OPENROUTER_API_KEY` are server-side secrets. They live in the gitignored
  repo-root `.env.local` and `supabase/functions/.env` for local functions, or in
  `supabase secrets` for staging/prod. They are never `VITE_*`/`EXPO_PUBLIC_*` values.
- Docker Desktop is installed; the local stack is optional day to day (ADR-006). When running:
  DB `54322`, API `54321`, Studio `54323`, containers `supabase_*_lderdvhteofqemiivosz`.
- Local Supabase stack was used for M1 and M4 reset/test/lint verification and is currently
  running. Serve the AI functions with
  `pnpm exec supabase functions serve --env-file supabase/functions/.env --no-verify-jwt`;
  the local Edge runtime is 1.77.4 (Deno 2.1.4 compatible) and Deno 2.9.6 is used for
  `deno check`/`deno test`.
- `AI_PROVIDER=fake` is set in the ignored `supabase/functions/.env` for local/staging smoke.
  `GEMINI_API_KEY` and `OPENROUTER_API_KEY` remain blank, so real-provider calls are not enabled
  until the user pastes a key/model and changes `AI_PROVIDER`.
- `dblink` concurrency tests connect via `host=db port=5432` so password auth is used;
  loopback connections match the local trust rule and are rejected by dblink for
  non-superusers.
- Supabase MCP was used for the first staging migration apply. MCP creates its own migration
  versions; staging history was then aligned to the local versions. The database password is
  now stored in the gitignored root `.env.local` and in the GitHub `staging` environment, and
  `supabase db push --dry-run` reports `Remote database is up to date`. Future applies use the
  CI push or a local `db push`, not MCP, unless history is aligned again.
- Deploy-path decision: `.github/workflows/supabase.yml` owns staging/production migrations.
  The Supabase GitHub integration stays connected for preview branches only; `Supabase Preview`
  currently skips, and its production deploy must remain off.
- Project skills live in `.agents/skills` (14 official Expo/Supabase skills, ADR-007).
- Reference repo lives at `../WhatToCook-AI-Powered-Recipe-Generator` (commit `2e8fa3f`)
  and is strictly read-only.

## Blocked / waiting on human

- H1: Play Console account (needed later, M7+).
- M4: the gateway is implemented and verified locally with the fake provider and with LM Studio
  (`AI_PROVIDER=lmstudio`). Staging runs `AI_PROVIDER=fake`. The real Gemini smoke needs H5
  (`GEMINI_API_KEY`) and manual verification of the model IDs/prices because the official Google
  docs return 403 from this environment. The OpenRouter smoke needs `OPENROUTER_API_KEY` and
  `OPENROUTER_MODEL`; the adapter and config tests are already green, but this machine's
  OpenRouter network access is blocked by a security policy (403) from Cloudflare, so a live
  OpenRouter smoke can only run from an allowed network. LM Studio covers local development in
  the meantime. The web AI pages remain in their intentional `ai_not_ready` state until WM3
  wires them to these functions.
- M8: create the production Supabase project and a protected production GitHub environment.
- PR #7 checks: `Typecheck, lint, test, build`, `Secret scan`, and `Local schema and pgTAP`
  pass. The staging deploy job skips on pull requests by design; after merge, verify the first
  `main` run uses the `staging` environment secrets.
- M0 blockers H2, H3 and H7 are resolved.
