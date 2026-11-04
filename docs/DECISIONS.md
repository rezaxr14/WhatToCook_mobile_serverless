# Decisions (ADR log)

Short records for non-obvious choices. Newest last. The full build plan lives in the
untracked `implementation_plan.md`.

## ADR-001 — pnpm workspace monorepo

**Context:** mobile (Expo), serverless web (Vite) and shared domain code must ship together.

**Decision:** one pnpm workspace with `apps/*`, `packages/*`, `supabase/` to be added in M1.
`packages/shared` exports TypeScript source (no build step) so both clients consume the same
types, locale data, match engine and API client.

**Consequences:** apps must be transpile-capable for workspace TS (Vite and Metro both are).
No per-package `dist` for shared; typecheck per package.

## ADR-002 — Reference repo is read-only, plan is untracked

**Context:** the Django app keeps its own development process.

**Decision:** the reference checkout is `../WhatToCook-AI-Powered-Recipe-Generator`. It is
never modified, committed to, or deployed from this repo. The build plan
(`implementation_plan.md`) is excluded via `.git/info/exclude`, not `.gitignore`, so it stays
local and is never committed by accident.

**Consequences:** porting notes must carry the knowledge needed to reimplement behavior;
CI cannot depend on the reference checkout.

## ADR-003 — Web is a static, host-agnostic SPA

**Context:** the web app must run on Vercel, Fastly or GitHub Pages without a server.

**Decision:** `apps/web` builds to static `dist/`; browser talks to Supabase only. Public
marketing/legal routes are prerendered at build time; app routes are a SPA. Host specifics
(base path, rewrites, headers) live in deploy config, not application code.

**Consequences:** no SSR/Next runtime; OAuth uses PKCE + redirect; GitHub Pages needs a
configurable `base` and `404.html` fallback (validated in WM4).

## ADR-004 — Toolchain versions at M0

**Context:** 2026 ecosystem; Node 23.7 and Docker are available locally, no admin rights.

**Decision:** Node target `>=22.12` (`.nvmrc` 22), pnpm 12.14, TypeScript 6.0, Vite 8,
React 19, Vitest 5, ESLint 10 flat config, Prettier 3. Expo SDK is recorded later in M2.

**Consequences:** revisit on each Expo SDK upgrade. CI pins Node 22 LTS.

## ADR-005 — Android application ID

**Context:** H7 (permanent Android application ID) is a human decision.

**Decision:** `com.whattocook.app`, confirmed by the user on 2026-10-21 before any Play submission.

**Consequences:** treat it as permanent from M2 onward; changing it after Play publication is
impossible.

## ADR-006 — Docker is optional locally

**Context:** Docker Desktop runs a heavy VM and the user prefers not to keep it running.

**Decision:** the local Supabase stack (`supabase start`) is **not** required for day-to-day
frontend/shared work. Docker is started only when we need local Postgres/Edge Functions, and
stopped afterwards. Database migrations and pgTAP tests are also verified in GitHub Actions,
whose runners provide Docker, so CI remains the source of truth.

**Consequences:** M1's `supabase db reset` acceptance runs either locally (Docker on demand) or in
the CI `supabase` job. Integration testing against staging needs a hosted project (H3).

## ADR-007 — Project-scoped agent skills

**Context:** M0 requires reviewed Expo and Supabase guidance for the agent. OpenCode discovers
project skills under `.agents/skills`.

**Decision:** installed 14 official, MIT-licensed skills with
`npx skills add <repo> --agent opencode --copy`, pinned in `skills-lock.json`:

- Expo (12): `expo-overview`, `expo-project-structure`, `expo-router`, `expo-native-ui`,
  `expo-design-system`, `expo-data-fetching`, `expo-dev-client`, `expo-module`, `expo-upgrade`,
  `eas-app-stores`, `eas-update`, `eas-workflows`.
- Supabase (2): `supabase`, `supabase-postgres-best-practices`.

No third-party React Native performance or web/Vite skill was added: the official Expo set covers
design/data guidance and Vite/React docs are authoritative. No MCP server is configured (the client
reports no resources); Expo MCP needs EAS, and Supabase MCP needs a project, so both wait for M1+.

**Consequences:** skills are committed so every agent gets the same reviewed instructions; refresh
with `npx skills update` after reviewing the diff. The installer reported 0 Socket alerts; Snyk
labels the Supabase skill medium risk, and manual review found only guidance and doc links.

## ADR-008 - Hosted Supabase staging and migration workflow

**Context:** M1 needs a real hosted project for staging verification. Local Docker is optional
(ADR-006), the Supabase GitHub integration status is not machine-verifiable, and the remote
database password was not stored on the workstation.

**Decision:** staging is the Supabase project `WhatToCook` (`lderdvhteofqemiivosz`, `eu-west-1`).
Migrations are the source of truth. The catalog seed is a migration, not only `seed.sql`, so
staging receives the same 80 ingredients / 12 recipes / 65 joins through `supabase db push`.
`supabase/seed.sql` stays local-only and documents that the canonical catalog is a migration.

Local verification is `supabase db reset` plus `supabase test db` plus `supabase db lint`.
`.github/workflows/supabase.yml` repeats those checks on pull requests. On `main`, after the
checks, it runs `supabase link` + `supabase db push` and re-uploads the 12 catalog images. The
three credentials are stored in the GitHub `staging` environment and mirrored in the ignored
root `.env.local`:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

The database password was rotated on 2026-10-22 so `supabase link` and `db push` can run without
a human. A `db push --dry-run` with the new password reports `Remote database is up to date`.
The committed `.env.example` documents the full environment contract, and
`apps/web/.env.example` documents the public Vite values. Mobile public values use
`EXPO_PUBLIC_*` when M2 lands.

**Deploy-path decision:** the GitHub Actions workflow is the single owner of staging and
production migrations. The Supabase GitHub integration stays connected for preview branches
only; its `Supabase Preview` check currently skips, and its production deploy must remain off to
avoid racing the workflow.

The Supabase MCP is now a last-resort fallback for one-off remote DDL. MCP records its own
timestamped migration versions, so after an MCP apply the staging
`supabase_migrations.schema_migrations` history must be aligned to the local file versions.
Normal changes use the CI push or a local `db push`, not MCP.

**Consequences:** `supabase db push` sees the local versions as already applied. The workflow's
image upload is idempotent by removing each object before `storage cp` (the command is
experimental and does not upsert). The workstation can verify staging through SQL/MCP and the
REST API, and CI can deploy without a human-held password. Rotating the database password again
requires updating both `.env.local` and the `staging` environment secret.

## ADR-009 - Matcher and quota semantics live in Postgres

**Context:** Android, web and any future client must produce identical match results and must not
be able to mint AI usage. The reference matcher has exact rounding and partial-match behaviour.

**Decision:** `can_cook()` in Postgres is authoritative. A recipe is a full match only when every
ingredient is present; otherwise it is a partial match when
`missing_count <= 2 OR match_pct >= 50`. A 0% recipe with two missing ingredients is therefore a
partial match, not excluded. Percentages use `python_round()`, which applies banker's rounding
(round half to even) like Python, not PostgreSQL's `round()`.

AI quota RPCs are `service_role`-only. `reserve_ai_quota()` takes a per-user/feature advisory
lock, is idempotent by `request_id`, checks kill switch, feature flag, daily limit, monthly
budget and global daily cap, then inserts a reserved event and counter. `settle_ai_usage()` and
`refund_ai_usage()` adjust counters once and are idempotent. Clients call `get_my_usage()` and
read only their own usage rows through RLS.

**Consequences:** Edge Functions must call the quota RPCs with the service role; clients cannot
call them directly. A TypeScript matcher can exist for previews but must be tested against the
same fixtures as the SQL function. The pgTAP suite locks in the semantics, including two
simultaneous reservations against a limit of one.

## ADR-010 - Anonymous demo identity instead of a shared demo account

**Context:** The reference app ships a shared ChefDemo account and a demo pantry. A shared account
in a public deployment leaks one pantry across visitors and makes RLS testing meaningless.

**Decision:** the demo flow uses Supabase anonymous sign-in plus `seed_demo_data()`. Every visitor
gets their own user id, profile, pantry and grocery rows. `seed_demo_data()` upserts the same
11 demo ingredients, so it is idempotent. `delete_my_account_data()` removes the public domain
rows; the auth user is left for the Admin API cleanup step.

**Consequences:** anonymous sign-ins are enabled in staging Auth config and in local
`config.toml`. Supabase anonymous users use the `authenticated` role, so security advisors report
anonymous access to policies; that is expected. The demo does not need a shared password, a
seeded auth user, or a `demo_pantry` table.

## ADR-011 - Explicit grants, deny-by-default, and server-only AI tables

**Context:** the repository and database are public-facing. New Supabase tables must not become
world-readable because a future migration forgot a policy.

**Decision:** `auto_expose_new_tables = false` and explicit grants are used. Every public table
has RLS enabled. `anon` and `authenticated` lose all table grants first, then receive only:
catalog read (`plans`, `ingredients`, `recipes`, `recipe_ingredients`), own-row access
(`profiles`, `pantry_items`, `grocery_items`, `ai_usage_events`, `ai_usage_counters`), and
authenticated `get_my_usage` / `seed_demo_data` / `delete_my_account_data` RPCs.

`ai_global_daily`, `ai_model_prices`, `ai_response_cache` and `app_config` are server-only and
carry explicit client-deny policies. Trigger helpers (`handle_new_user`, `rls_auto_enable`) have
`EXECUTE` revoked from client roles. Storage keeps `recipe-images` public-read and
`scan-uploads` private with owner-folder policies. `storage.objects` RLS is already enabled by
Supabase; migrations must not try to alter it as the migration role is not its owner.

**Consequences:** adding a table requires an explicit grant and policy in the same migration.
The advisor still reports the intentional authenticated `SECURITY DEFINER` RPCs and the
anonymous-sign-in policy notices; these are documented exceptions, not missing hardening.

## ADR-012 - AI gateway as shared Edge Function modules

**Context:** suggestions, recipe detail, sous-chef chat, streaming, fridge scanning and
substitutions need one quota/cache/provider path. Provider keys must stay server-side, and the
client must not be able to choose a model or mint usage. M4 explicitly does not build the mobile
or web feature UI; those are M5 and WM3.

**Decision:** implement three Deno Edge Functions (`generate-recipe`, `scan-pantry`,
`suggest-substitution`) over `supabase/functions/_shared/`. The shared layer owns auth, CORS,
config/routing, quota wrappers, cache, prices, validation/repair, NDJSON and provider dispatch.
Wire schemas live in `packages/shared/src/ai-contracts.ts` so future clients share the contract
without duplicating limits or error codes.

Provider selection and model IDs come from `app_config.model_routing` and deploy-time
`AI_PROVIDER` overrides. `gemini`, `openrouter`, `lmstudio`, and `fake` are the runtime provider
ids. Gemini uses `GEMINI_MODEL`/`GEMINI_VISION_MODEL`; OpenRouter and LM Studio share the
OpenAI-compatible chat-completions adapter but keep their own `OPENROUTER_*` / `LMSTUDIO_*`
model and fallback settings, because their model ids are namespaced and cannot reuse the Gemini
routing. A client-supplied `provider` is honored when it is in the deployment's
`allowedProviders`, and a namespaced free model id without a provider implies OpenRouter; a
client `model` is honored only when it is server-allowlisted (OpenRouter additionally accepts
free `*:free` ids). Photo scans always use the deployment's primary provider. `fake` is a
deterministic, zero-cost adapter used in Deno tests and staging; LM Studio is a local-only,
zero-cost provider for development.

Gemini routes every feature to `gemini-3.5-flash-lite`, with `gemini-3.1-flash-lite` as the
single fallback. Only Flash-Lite models are used: Lite is cheaper and far faster than the
thinking models, 3.8 was dropped after repeated `503 UNAVAILABLE` responses, and 3.6 is disabled
so the fallback stays in the same family. `ai-models` exposes the routed model plus its
fallbacks, and a client `model` from that catalog is honored, so the AI Chef dropdown changes the
model rather than only the label. When an OpenRouter key is present, the catalog also exposes
exactly one OpenRouter entry: the deploy-selected `OPENROUTER_MODEL` (staging uses
`openrouter/free`), never the whole free catalog. Selecting it switches the request provider to
OpenRouter even under a Gemini-primary deployment. When `AI_FALLBACK_PROVIDER=openrouter` is set
and an OpenRouter key exists, a Gemini failure before any output is retried on
`OPENROUTER_MODEL`. Free calls allow 60 seconds (120 for streams) and structured free requests get
at least 4,096 output tokens because the router may spend part of the budget on reasoning; free
ids settle at $0. Pantry photos stay on Gemini unless `AI_FALLBACK_VISION=true` because the free
router did not satisfy the scan schema in testing. All user text and image-derived labels are
untrusted data, never instructions; structured output is schema-validated with at most one repair
attempt.

`verify_jwt = false` is set on all four functions so browser CORS preflight reaches the shared
layer. Every non-`OPTIONS` request to an AI function is still rejected by `_shared/auth.ts`
without a valid user JWT; `ai-models` is intentionally public and returns provider/model metadata
only. Browser origins are allow-listed through `ALLOWED_ORIGINS`; native clients send no
`Origin`. Provider keys are only read from function secrets / `supabase/functions/.env`, never
from `VITE_*` or `EXPO_PUBLIC_*`.

Guardrails: a kill switch, per-feature flags, per-plan daily limits, per-plan monthly budget and
a global daily micro-USD cap. `substitution` is its own feature so cheap substitutions do not
consume chat allowance. Image scans enforce magic-byte type checks, plan size caps and
EXIF/XMP/IPTC stripping; the image is never persisted.

**Consequences:** no custom server runtime is introduced. The web and mobile AI clients stay in
their intentional not-connected state until WM3/M5, then call these same functions. Staging can
run with `AI_PROVIDER=fake` for deterministic, zero-cost integration tests. Real Gemini traffic
requires H5 (the key) and manual verification of current model ids and prices. OpenRouter can be
enabled without a database migration: its model id is deploy-time configuration, and pricing
falls back to conservative env-configured estimates when no `ai_model_prices` row exists. Missing
keys or models fail closed with `provider_error`.

## ADR-013 - Cache, idempotency and quota accounting

**Context:** retries, double-clicks and duplicated streams must not double-charge; cached
responses should be visible to admins but should not consume a user's daily allowance.

**Decision:** `reserve_ai_quota` / `settle_ai_usage` / `refund_ai_usage` remain the only quota
mutators and are `service_role`-only. The gateway reserves before calling the provider, settles
actual token usage/cost on success, and refunds once on provider or validation failure. A stream
cancelled after partial output settles partial usage instead of refunding. Initial usage-snapshot
failures after reserve are also refunded.

Normal response cache keys include feature, provider, model, locale, prompt version and a
normalized payload (for scans, the SHA-256 of the metadata-stripped image). TTL is 7 days;
`force_refresh` skips the read but still writes. The idempotency cache uses
`idem:<sha256(user, request)>`, a 24-hour TTL and a deterministic UUID in
`ai_usage_events.request_id`. A repeat with the same `Idempotency-Key` returns the original
response with `duplicate: true` and no new charge. If that cache entry has expired but the
settled event remains, the gateway returns `409 duplicate_request` rather than charging again.

A normal cache hit inserts a zero-cost `ai_usage_events` row with `cache_hit=true`, increments
the cache hit counter, and is excluded from daily/monthly quota checks. It remains visible in
`v_ai_spend_daily`, `v_ai_spend_by_user` and `v_ai_cache_hit_rate`. Idempotent retries reuse the
original row and do not insert another. Optional `AI_RPM_LIMIT` / `AI_RPD_LIMIT` env guards run
before reservation and cap global provider attempts per rolling minute and UTC day; blank
disables them, and cache hits/idempotent replays are not counted. Structured
`suggestions`/`detail` responses are validated before NDJSON is emitted and then chunked; only
`chat`/`stream` forward live provider deltas.

**Consequences:** a cache hit still appears in audit views but is not a billed request. Cache
purging is safe but forces the next call to the provider. The cache stores response JSON, never
uploaded image bytes. `ai_response_cache` keys are constrained to 16-128 characters, and
`ai_usage_events.request_id` remains a UUID.

## ADR-014 - Expo SDK 58 shell, shared translations, token styling

**Context:** M2 needs a runnable Android shell with auth, five locales and RTL. The plan listed
NativeWind, but the current Expo default template already ships a token-based StyleSheet setup.
Adding NativeWind would introduce Babel/Metro configuration and a second styling idiom.

**Decision:** keep the SDK 58 `expo-template-default` layout (`src/app`, `@/*` alias) and use
StyleSheet design tokens in `apps/mobile/src/constants/theme.ts`. The tab shell uses Expo
Router's JS `Tabs` with `@expo/vector-icons/Ionicons` (M2 had four tabs; M5 adds an AI Chef
tab); `NativeTabs` needs per-tab image assets that the starter does not provide. Locale JSON
moved to `packages/shared/src/locales` and is exported as `translations`, so web and mobile
share one copy; mobile-only strings live under `mobile.*` in all five locales. Auth and
language preference use `expo-secure-store`; `react-native-url-polyfill` backs `supabase-js`,
and `AppState` suspends token refresh while the app is backgrounded. The application ID
remains `com.whattocook.app` (ADR-005). Mobile AI screens call the same Edge Functions as web
through `supabase.functions.invoke`, so no provider key is bundled; the optional `ai-models`
catalog falls back to the shared free-model list. `expo-image-picker` supplies the pantry
scanner, with images compressed client-side and sent as base64 JSON.

The web app is still React 18 while mobile is React 19. pnpm's hidden hoist resolves
`@types/react@19` for `react-router` during the web typecheck, so `apps/web/tsconfig.json` maps
`react` and `react/jsx-runtime` to the web-local `@types/react` 18.

**Consequences:** no NativeWind dependency; screens are plain React Native styles that can be
migrated later. New mobile copy must be added to every locale; the shared locale test enforces
mobile key parity. The first Android dev-client build still needs the Android SDK or EAS login.

## ADR-015 - Client AI polish: mixed picker, server dish photos, resilient scanner, hero poster

**Context:** the AI Chef picker listed only one vendor at a time, AI recipes could arrive without
a usable photo, the web fridge scanner posted multipart data the JSON-only function rejected, and
the landing page's WebGL hero made every visit feel slow before the first frame appeared.

**Decision:** the model picker renders both Gemini models and the single deploy-selected
OpenRouter model in one menu; `provider` follows the selected model, and the mobile client infers
OpenRouter from a namespaced free model id. The gateway assigns a curated `recipe-images` Storage
photo to every suggestion and detail response before caching, so clients never render a
model-supplied image or an external hotlink. The web scanner sends `{ image, mime_type }` JSON,
normalizes the server's `items` array, and adds catalog `ingredient_id`s (falling back to a name
for unmatched detections). A photo scan always runs on the primary provider. On the landing page,
the first visit captures the rendered WebGL frame to `localStorage` (`wtc_hero_poster_v1`); later
visits paint that poster immediately and fade it out when the live scene is ready. The
full-screen loading veil was replaced by a small pill so hero copy is readable during shader
compilation, and the drawing buffer is only preserved on the visit that captures the poster.

**Consequences:** the picker has one OpenRouter entry instead of a catalog, so operators change
the exposed free model with `OPENROUTER_MODEL` rather than a code change. Dish photos are
revalidated manually by replacing objects in `recipe-images`; there is no per-request external
image fetch. The hero poster is a per-browser cache: clearing site data or changing the scene
without bumping `HERO_POSTER_KEY` shows the previous frame until the next capture. Free-router
latency remains variable, so OpenRouter calls use longer timeouts than Gemini.

## ADR-016 - UX pass: stable scene lights, full-frame scans, visible add confirmations, guided grocery entry

**Context:** the first landing visit still stalled when the fridge opened and again as the
cooking chapter began; vertical fridge photos were cropped by the preview; pressing "Add to
pantry" closed nothing and gave no proof the ingredients landed; the scanner was a small header
icon; and both grocery forms were plain text boxes.

**Decision:** every scene light is now a permanent member of the render list and only its
intensity changes. The fridge, pendant and moonlight rig moves with the sinking room but is no
longer a child of it, the cooking station keeps its flame light while scaling to zero, and the
key spotlight's shadow map updates only through the cooking/finale window. The hero reveals on
the first painted frame, captures its poster with async `toBlob`, and warms the hidden chapters
with `compileAsync` off the critical path. Scanner previews show the full photo with
`object-contain` over a blurred cover backdrop, mobile pickers no longer force a crop, and only
catalog-matched detections are added; a scan summary persists in `PantryContext` until a
dismissible banner on `PantryPage` confirms the result. The scanner is promoted to a full-width
AI Vision card on web and mobile. Grocery entry now searches the shared ingredient catalog,
suggests matches while typing, offers popular staples, and pairs an amount stepper with a unit.
Android's hardware back on the tab root asks before closing the app.

**Consequences:** chapter transitions no longer recompile materials, at the cost of computing
light intensity every frame and keeping zero-intensity lights in the shader. The scanner skips
detections that are not in the catalog instead of attempting a name insert that would 404 and
abort the batch. Web keeps a per-session scan summary until dismissed; mobile confirms with a
native alert before returning to the pantry list.

## ADR-017 - Catalog growth from AI scans, install affordance and CI device builds

**Context:** the scanner discarded detections whose names were not in the seed catalog, and
manual entry rejected them too, so users lost plausible foods. The PWA install banner sat on
top of the Grocery/Telegram quick actions, and installing the Android toolchain is the slowest
part of a device smoke test.

**Decision:** add `add_custom_pantry_ingredient(p_name, p_category)` as a `SECURITY DEFINER`
function. It requires `auth.uid()`, bounds the name to 2-80 printable characters, maps the
category to the stored English set (falling back to `Other`), reuses a catalog row matching
`lower(name_en)`, otherwise inserts a slugged row, and upserts the caller's pantry item in the
same transaction. Execute is revoked from `public`/`anon` and granted to `authenticated`.
Clients call it for unmatched scan detections and for unknown manual entries. The install
button moved into `QuickActionsWidget` beside Telegram; the old banner keeps only the offline
status pill. `android-device.yml` builds a debug-signed release APK in CI for device testing.

**Consequences:** AI-detected foods become shared catalog rows (English name only until
someone adds translations), which is intentional: the next scan matches them normally.
Catalog writes are possible only through this validated RPC, and the unique pantry constraint
makes repeated scans idempotent. The CI APK uses the debug keystore, so it cannot upgrade a
Play-signed install; uninstall first or keep the keystore consistent.

## ADR-018 - Adaptive challenge, provider pools, and a service principal without an account

**Context:** the cost-bearing AI calls were protected only by per-user quotas. A script could
still create accounts, the anonymous demo could consume the provider's entire daily quota, and
main's Django app needs to call the gateway without minting a synthetic `auth.users` row. The
plan also requires a captcha that does not break the native Android app, and two prerequisites
are still missing: Turnstile keys (H1) and the Play Integrity service account (H2).

**Decision:** every provider-bound request (cache hits and idempotent replays excluded) calls
`consume_ai_challenge(user_id, challenge_every_n_calls)`. When the counter has reached the
threshold, the gateway returns `403 challenge_required` with the acceptable `kinds` at the top
level and does not touch quota. A successful `verify-challenge` call resets the counter and
records the verification kind. Web always uses Turnstile (`action=ai_gate`, optional hostname
allowlist); Android uses Play Integrity with a server-issued, single-use nonce. Because H2 does
not exist yet, `challenge_mobile_enforce` defaults to `false`: web is challenged, Android is
skipped and instead gets the lower `anonymous_unattested_daily_cap` (10) when it draws from the
anonymous pool. When a Play Integrity token is submitted without a configured service account,
`verify-challenge` returns `502 provider_error` and enforces nothing.

Provider capacity is split into daily anonymous (60 %) and registered (40 %) pools of the
`AI_RPD_LIMIT` guard, which is itself set to 95 % of the provider's real limit. Pool accounting
is atomic inside `reserve_ai_quota`; exhaustion returns `429 ai_pool_exhausted` with
`details.pool`. Every provider HTTP attempt — primary, fallback, and schema retry — increments
`ai_provider_attempts` through `record_provider_attempt`, so a retry cannot hide behind a single
reservation. Per-user daily caps are 20 AI requests + 5 scans for anonymous and 60 + 15 for free;
they remain plan data.

Main's adapter authenticates with `X-Service-Key`, compared against `MAIN_SERVICE_KEY` as
SHA-256 digests (constant time, minimum 32 characters). Service calls set
`principal_class: "anonymous" | "registered"` and may send `end_user_ref`; only an 8-hex FNV-1a
hash of that reference is stored. Service traffic bypasses the challenge and per-user caps but
consumes the matching anonymous/registered pool, so it cannot exceed the provider guard. There is
no `auth.users` row: `ai_usage_events.user_id` is nullable, every service row carries
`service_principal`, and a check constraint requires one of the two. `get_service_usage` supplies
the service snapshot.

**Consequences:** `challenge_required` is a normal 403, not a quota charge, and clients must
route it to a verification UI; the web and mobile clients already map it to localized copy.
`ai_pool_exhausted` means "today's capacity", not "your limit", and prompts anonymous users to
sign in. Deployments without H1 (`TURNSTILE_SECRET_KEY`) cannot complete web verification, so
`challenge_web_enforce` is switched off there (ADR-020) instead of leaving every web AI call
failing closed; turn it on when the keys exist. Deploying
H2 only requires setting `PLAY_INTEGRITY_SERVICE_ACCOUNT` (and optionally the package name),
flipping `challenge_mobile_enforce`, and shipping the Android attestation UI. Service keys are a
shared secret: rotate `MAIN_SERVICE_KEY` in both projects together. Only a short end-user hash is
stored, so service usage can be attributed for abuse review but not tied back to a person from
the database alone.

## ADR-019 - Telegram bot runs as the linked profile through the shared gateway

**Context:** main already has a Telegram bot (`run_telegram_bot.py`) with `/start <token>`,
`/pantry`, `/add`, `/remove`, `/cook` and `/shoppinglist`. The plan asks the serverless
repo to port that behaviour, not to rewrite main's bot, and to put the bot's AI behind the same
challenge/pool/quota rules as the apps. H3 (the bot token) is not available yet.

**Decision:** the bot is an HTTPS webhook Edge Function (`telegram-webhook`), not a polling
process. Telegram calls it with `X-Telegram-Bot-Api-Secret-Token`; the function returns
`503 webhook_secret_not_configured` when `TELEGRAM_WEBHOOK_SECRET` is empty, so a mistake in
deployment cannot leave a public endpoint that spends provider quota. Each chat is throttled with
a fixed 60-second window in `telegram_rate_windows` (default 20 messages/minute).
`telegram-link` issues a one-time 10-character code (unambiguous alphabet, 10-minute TTL) for
the signed-in profile; `/start <code>` consumes it atomically and stores the chat id on
`profiles`.

`/cook` calls `generateForAuth`, the same pipeline as the HTTP gateway, with an
`AuthContext` marked `internal` and `challengeExempt`. The linked profile's plan and daily
caps apply, and the call draws from the registered pool. No captcha is involved because access is
already gated by account linking. Usage is read through `get_user_usage_for_service` because
`get_my_usage` depends on `auth.uid()` and the bot has no user JWT. Replies are plain text
(no Markdown parse mode), matching main.

**Consequences:** the bot must be redeployed when `TELEGRAM_BOT_TOKEN` or the webhook secret
changes, and `setWebhook` must be re-run when the function URL changes. A failed send is logged
and never retried by the function; Telegram retries the update if the response is not 200, so
handlers are idempotent enough for a replay (link codes are single-use, pantry writes upsert).
The helper RPCs are revoked from `anon`/`authenticated`; only the service role can call them.
Without H3 the code ships untested against a real bot, and the web modal shows a linking error
rather than a dead link.

## ADR-020 - Web Turnstile has its own enforcement switch

**Context:** plan prerequisite H1 (Cloudflare Turnstile keys) is still missing. Without a secret,
verify-challenge returns provider_error, and because the adaptive gate asks new users to verify
before their first provider call, every web AI request failed. Failing closed is the right default,
but it makes the deployed web app unusable, and the static build also needs a public site key
(VITE_TURNSTILE_SITE_KEY) before it can show the widget.

**Decision:** add app_config.challenge_web_enforce (default true) and honour it in
enforceChallenge, the same way challenge_mobile_enforce gates Android. The web client now mounts a
ChallengeModal; on 403 challenge_required it renders Turnstile, calls verify-challenge, and
retries the AI request once. While H1 is missing the live project runs with the flag off, so web
traffic stays in the anonymous pool under its caps; the modal shows an explanatory error if a
challenge is somehow requested without a site key.

**Consequences:** enabling web attestation is a config update plus a rebuild with the site key, not a
code change. Turning it off weakens abuse protection, so it is a temporary deployment state, not
a supported long-term default; record the flag when reporting deployments.
