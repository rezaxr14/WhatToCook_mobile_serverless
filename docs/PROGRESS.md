# Progress

> Local, agent-maintained log. Update at the end of every milestone. The plan itself
> (`implementation_plan.md`) is untracked via `.git/info/exclude`.

## Current

**Milestone:** M2 - mobile shell, auth and i18n (implemented; release APK validated on a physical
Android 14 device on 2026-10-24). M5 - mobile AI Chef, recipe detail/chat, substitutions and
pantry scanner (implemented; validated on-device with the staging fake provider). M6 - mobile
recipe catalog and non-AI recipe detail (implemented; validated on-device). M7 - release pipeline
scaffolding (authored; H8/H9 blocked on the keystore and Play Console). M8 - gateway rate limits
(implemented and unit-tested; migration deploy + staging smoke pending). M4 - AI gateway
(implemented and deployed to staging with the fake provider; real Gemini smoke blocked on H5).

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
- [x] Route metadata (title/description/robots/canonical) kept in sync per route; authenticated
      and AI-result routes are `noindex`
- [x] `robots.txt` always emitted at build time, `sitemap.xml` when `VITE_SITE_URL` is set
- [x] `public/_headers`: nosniff, frame DENY, referrer policy, permissions policy, HSTS, asset
      caching (CSP stays host-owned because it depends on the Supabase origin)

## M2 checklist (mobile shell, auth, i18n)

- [x] `apps/mobile` scaffolded with Expo SDK 58 (`expo-template-default@sdk-58`), React 19.3,
      React Native 0.88, Expo Router, TypeScript strict, `src/app` layout
- [x] `app.config.ts`: name/slug `WhatToCook`, scheme `whattocook`, application ID
      `com.whattocook.app` (ADR-005), adaptive icon, splash plugin, secure-store plugin
- [x] Design tokens (`colors`, spacing, radius, type, shadows) mirroring the web brand palette
- [x] Supabase client with `expo-secure-store` session persistence, PKCE, and AppState-aware
      token refresh; only `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are bundled
- [x] Auth: first-launch anonymous session, explicit guest demo with `seed_demo_data()`,
      email/password sign-in and sign-up, sign-out, friendly auth errors
- [x] Shared translations moved to `packages/shared/src/locales`; five locales, device-language
      detection, persisted language choice, RTL direction flag and restart hint
- [x] Tab shell (Pantry, Cook, Grocery, Settings at M2; AI Chef added in M5) with Ionicons and brand styling
- [x] Pantry screen: ingredient search, add, remove, clear, pull-to-refresh
- [x] Cook screen: `can_cook()` full/partial matches, match %, missing ingredients, images
- [x] Grocery screen: add, check, delete, clear-checked, pull-to-refresh
- [x] Settings screen: account, five-language picker, version/server info, sign-out
- [x] Mobile typecheck, `expo lint`, `expo config` validation and Android Metro export green
- [x] Shared package tests cover localization helpers and mobile locale key parity (12 tests)
- [x] Web typecheck and production build green after the shared-translation refactor
- [x] Native debug build on Linux/WSL2 - `./gradlew :app:assembleDebug` (see 2026-10-24)
- [ ] Install/run that APK on a device or emulator - needs hardware
- [x] Release APK installed and run on a physical Android 14 device (2026-10-24): guest session,
      five-tab shell, pantry/cook/catalog/AI/scanner/Settings walkthrough, `fa` RTL after restart
      and back to `en`
- [x] Jest + `jest-expo` + RNTL component tests (16) for the shared UI primitives
      (`Button`, `Chip`, `EmptyState`, `TextField`) and `CookingTimer` (start/pause/resume,
      add time, reset); `pnpm test` runs vitest then jest
- [ ] Maestro smoke flow - needs a device/emulator

## M5 checklist (mobile AI Chef, recipe detail, scanner)

- [x] Mobile AI client (`apps/mobile/src/features/ai/api.ts`) invokes the deployed Edge
      Functions directly; provider keys stay server-side, 404/501 becomes a translated
      "not connected" state, 429 surfaces the quota message, and response shapes are
      normalised for RN
- [x] Dish photography helper ported from web (`src/lib/dish-images.ts`) with unique fallbacks
- [x] AI Chef tab: pantry-seeded ingredient chips, custom ingredients, dietary chips, servings,
      surprise level 0-3, free-model selector from `ai-models` with static fallback, remaining
      quota badge
- [x] AI recipe detail: hero/meta, nutrition, ingredient checklist, step completion, chef tips,
      grocery-list export, inline substitutions, and recipe chat
- [x] Pantry scanner: `expo-image-picker` camera/library, 6 MB guard, base64 JSON to
      `scan-pantry`, review of matched items, add matched IDs to the pantry; unmatched items
      are shown but disabled
- [x] Scanner entry points in the Pantry header and empty state; new routes registered in the
      root Stack
- [x] New copy under `mobile.ai`, `mobile.recipe`, `mobile.scan`, `mobile.tabs.aiChef` in all
      five locales; shared locale parity test still passes
- [x] `expo-image-picker` plugin configured with camera/photo permission strings and Android
      `RECORD_AUDIO` disabled
- [x] Staging API smoke from a native-shaped client: suggestions (5), detail (3 ingredients /
      2 steps), chat, scan (5 detected / 4 matched), substitution (2), and `get_my_usage`
- [x] Mobile typecheck, `expo lint`, shared tests (12), mobile helper tests (5) and Android
      Metro export green
- [x] On-device AI Chef / scanner walkthrough (2026-10-24, staging fake provider): suggestions,
      AI recipe detail, substitutions, chat, and a gallery-image scan that detected 4 ingredients
      and added 2 new pantry items
- [ ] On-device camera capture path (only the photo-library path was exercised)
- [ ] Screen-level RNTL tests for the AI/scan flows and a Maestro flow - the shared UI
      primitives are covered, the screens are not yet

## M6 checklist (mobile recipe catalog and detail)

- [x] Catalog data layer (`src/features/recipes/use-recipes.ts`): localized recipe
      summaries and details, sorted ingredient joins, and instruction parsing
- [x] `/recipes` catalog screen: search across recipe names, descriptions and ingredients;
      All / under-20-min / vegetarian / sweet filters; pull-to-refresh; loading, error and
      empty states
- [x] `/recipes` sort menu (bottom-sheet `ActionMenu`): recommended, quickest first, name A-Z;
      pure `sortRecipes` helper covered by 5 tests
- [x] Native share sheet from the catalog and AI recipe detail (name, description, deep link)
- [x] `/recipe/[id]` detail screen: hero and meta badges, 1/2/4/6/8 serving scaler,
      ingredient checklist with "in pantry" tags, inline AI substitutions, missing-only
      grocery export, step completion, in-app step timer and recipe chat
- [x] Cooking timer shared by catalog and AI detail: start/pause/restart, reset, +1/+5 min,
      progress bar and haptic completion alert; pure duration helpers covered by 5 tests
- [x] Cook tab: recipe-catalog banner and tappable full/partial match cards; catalog and
      detail routes registered in the root Stack
- [x] Shared `RecipeChatCard` and `SubstitutePanel` extracted from the AI recipe detail;
      both AI and catalog detail screens reuse them
- [x] New `mobile.recipes` copy and extra `mobile.recipe` keys in all five locales; shared
      locale parity test still passes
- [x] Mobile typecheck, `expo lint`, helper tests (26), component tests (19), shared tests
      (12), Expo config and Android Metro export green
- [x] Headless Chrome smoke of the web export: 12 catalog cards and images render;
      All / vegetarian / sweet return 12 / 10 / 3 recipes; searching `affogato` returns 1;
      detail scales 4 -> 2 servings and updates quantities; the timer starts at 15:00,
      pauses/resumes, adds time and resets; the substitution panel opens and degrades to the
      translated not-connected message when browser CORS blocks the function (native
      requests do not send an Origin)
- [x] On-device catalog/detail walkthrough (2026-10-24): 12 recipes with Storage images, recipe
      detail, servings and swap panel, Persian right-to-left layout after restart
- [ ] Screen-level RNTL tests for catalog/detail/substitutions and Maestro coverage

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

## M5 mobile AI verification (2026-10-22)

- Staging was called with the same request bodies the app sends: anonymous session ->
  `generate-recipe` suggestions (5 recipes), detail (3 ingredients / 2 steps / nutrition /
  chef tips), chat, `scan-pantry` (5 detections / 4 catalog matches), and
  `suggest-substitution` (2 substitutes). All returned 200 with the expected keys.
- `get_my_usage` returned `daily.suggestions.remaining`, `daily.scan.remaining`, and the
  monthly budget object, matching the mobile quota badge.
- `ai-models` returned the fake demo catalog (1 model / 1 provider). The mobile selector
  hides itself for a single model and falls back to the shared free OpenRouter catalog when
  the function is missing.
- Android Metro export succeeded (6.4 MB HBC bundle). Mobile helper tests for dish photography
  pass (5 tests). On-device camera, keyboard, RTL and chat behaviour still need a dev-client
  build.

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

## Known / deferred

- `expo-doctor` (2026-10-24): 18/20 checks pass. The config-schema check errors because
  the schema URL returns HTML on this network, and the version check reports six patch-level
  drifts inside SDK 58 (`expo` 58.0.17 vs 58.0.19, `expo-router` 58.0.25 vs 58.0.26, `@expo/ui`,
  `expo-font`, `expo-glass-effect`, `expo-image`). Not upgraded here because a patch bump needs a
  fresh prebuild plus a verified native rebuild/device run.
- Web public pages are client-rendered and locale is a preference, not a URL segment, so
  `sitemap.xml` lists the three public routes without per-locale alternates and without recipe
  detail URLs (they come from Supabase). Prerendering and `hreflang` need the locale-URL decision
  from WM4.

## CI and cross-client verification (2026-10-24)

- [x] GitHub Actions green on `e9e9939`: CI (typecheck, lint, tests, Deno check/lint/test,
      web build) and Supabase (local stack, `db lint`, pgTAP). The earlier red CI was a real
      `TS2869` in `_shared/ai-catalog.ts`, fixed in `e9e9939`.
- [x] Web parity audit against the read-only reference `frontend/src`: every page, component
      and asset is present; 23 files differ, and all of them are the intentional Django REST ->
      Supabase port (API clients, contexts, generated types, image URLs, shared translations)
      plus the new SEO/metadata module. No reference UI or feature is missing.
- [x] Supabase staging E2E with the anon key from `apps/web/.env.local` and
      `apps/mobile/.env.local` (same project): catalog reads, anonymous sign-in, pantry and
      grocery writes under RLS, `can_cook()`, role/aud claims in the JWT, and session sign-out.
      `generate-recipe` is reachable and returns a validation 400 for an empty body.
- [x] `expo export --platform android` bundles after the menu/share additions.

## GitHub Pages preview (2026-10-24)

- [x] `.github/workflows/web-pages.yml` publishes `apps/web/dist` to
      https://rezaxr14.github.io/WhatToCook_mobile_serverless/ on pushes to `main`
      (and via `workflow_dispatch`). Secrets `VITE_SUPABASE_URL` /
      `VITE_SUPABASE_ANON_KEY` are set in the repository.
- [x] Base-path support: `VITE_BASE_PATH` feeds Vite `base`, the React Router
      `basename`, canonical URLs and the build-time sitemap; `index.html` is copied
      to `404.html` for SPA deep links.
- [x] Supabase Auth site URL moved from `http://localhost:3000` to the Pages URL and
      `uri_allow_list` now includes Pages, local dev ports (3000/4173/5173/8081) and
      the `whattocook://` scheme. Email confirmation redirects use
      `window.location.origin + BASE_URL`.
- [x] PWA manifest uses relative URLs and 192/512 icons generated from the mobile
      icon. GitHub Pages cannot serve `public/_headers` (no custom headers).
- [x] Pantry/search ingredient thumbnails: `ingredients.image_path` is null for the whole
      seed catalog, so `mapIngredient` now resolves the reference Unsplash name map
      (87 entries, longest-key match + slug normalization) with a generic fallback;
      6 tests cover the lookup.
- [x] Ingredient photos cached server-side: `cache-ingredient-images` downloads the
      shared map, stores content-hashed objects in the public `ingredient-images`
      bucket with `max-age=31536000`, and fills `ingredients.image_path` (80/80).
      Web and mobile resolve the cached path first; the source map remains the
      pre-cache fallback. Manual refresh: `workflow_dispatch` on
      `.github/workflows/ingredient-images.yml` (`force`, optional slugs).
- [x] Local `vite preview` under the base path returns 200 for `/`, `/recipes`,
      `manifest.json` and hashed assets.
- [ ] Manual hero/feature comparison against the reference web app (owner).

## M7 release pipeline scaffolding (2026-10-24)

- [x] `APP_VARIANT=staging|production` selects the display name, Android package and iOS
      bundle id (`com.whattocook.app[.staging]`), so staging and production installs can
      coexist. `APP_VERSION_CODE` drives `versionCode`/`buildNumber`.
- [x] `.github/workflows/android-release.yml`: tag `v*` builds production; manual dispatch can
      build production or staging and optionally upload the AAB to the Play internal track as a
      draft. It prebuilds with JDK 17 + Android SDK, runs `bundleRelease`/`assembleRelease`, and
      uploads the AAB + APK as artifacts.
- [x] `apps/mobile/plugins/with-release-signing.js` switches the release build type to a real
      keystore only when `ANDROID_KEYSTORE_PATH` exists; local release builds keep Expo's debug
      signing.
- [ ] H8: generate the upload keystore and add `ANDROID_KEYSTORE_*` secrets to the production
      environment.
- [ ] H9: Play Console account + service account (`PLAY_SERVICE_ACCOUNT_JSON`), then run a tag
      build end to end and verify the internal-track install.

## M8 hardening: gateway rate limits (2026-10-24)

- [x] `public.ai_rate_windows` + `public.check_ai_rate_limit(...)` keep atomic fixed-window
      counters per user and per hashed client IP (RLS on, no policies, service role only).
- [x] Gateway now applies `AI_USER_RPM_LIMIT` (default 20/min), `AI_ANON_RPM_LIMIT` (default
      8/min) and `AI_IP_RPM_LIMIT` (default 40/min) before each provider attempt, on top of the
      global RPM/RPD and per-plan quotas. Over-limit responses are `429 rate_limited` with a
      window-aligned `Retry-After`.
- [x] Only SHA-256 hashes of client IPs are stored; requests without a proxy IP skip the IP
      guard. Cache hits and idempotent replays are exempt (same as the global RPM guard).
- [x] Deno unit tests for limit parsing, the RPC payload/scope/retry mapping and IP hashing;
      pgTAP coverage for the table, privileges and window behaviour.
- [ ] Deploy the migration and smoke-test the limits on staging.
- [ ] Remaining M8 items: Play Integrity, cost review, security checklist, backups/DR,
      legal pages, prod environment.

## On-device validation and RTL fix (2026-10-24)

**Device:** POCO X5 Pro 5G (`22101320G`, `bca32b3e`), Android 14, connected through the Windows
ADB server over TCP. Release APK `com.whattocook.app` 0.1.0 (versionCode 1), 101 MB,
`assembleRelease` 36m58s cold / 57s incremental with the generated `repo1.maven.org` mirror and
`-x lintVital*`.

### Verified on device

- Anonymous guest session created on first launch; Settings shows the guest account and
  "Connected to Supabase".
- Pantry: search, add (Tomato / Onion / Garlic), remove, clear-all, nutrition rows.
- Cook: partial-match ranking, missing-ingredient list, Storage-backed recipe images.
- Catalog: 12 recipes, search; recipe detail with servings and swap panel.
- AI Chef (staging fake provider): suggestions, AI recipe detail, substitution panel, recipe chat,
  daily-usage counter decrementing.
- Pantry scanner (photo-library path): 4 detections, 3 matched catalog entries, 2 new items added.
- Language switch to `fa`: Persian strings plus right-to-left layout after an app restart, then
  back to `en` with a left-to-right layout.

### Bug found and fixed: RTL direction was reset on every launch

`src/i18n/index.ts` called `applyDirection(deviceLocale())` at module init, before the stored
locale was loaded. On a device set to English, every launch forced LTR and overwrote the Persian
choice, so the restart hint never produced an RTL layout. `I18nManager.isRTL` also keeps
reporting the launch-time value, so a second call in the same session could flip the stored
preference again.

Fix: `applyDirection` remembers the last value it forced, and `LocaleProvider` applies the
direction exactly once from the effective locale (stored choice, else device locale). Verified by
forcing `fa`, restarting (RTL), then switching back to `en` and restarting (LTR).

Known data gap: ingredient and recipe names without a localized row fall back to English inside
an RTL layout. `adb exec-out screencap` intermittently produces tiled frames on this device;
`uiautomator` dumps and later captures are correct, so it is a capture artifact, not a rendering
bug.

## Blocked / waiting on human

- H1: Play Console account (needed later, M7+).
- M4: the gateway is implemented and verified locally with the fake provider and with LM Studio
  (`AI_PROVIDER=lmstudio`). Staging runs `AI_PROVIDER=fake`. The real Gemini smoke needs H5
  (`GEMINI_API_KEY`) and manual verification of the model IDs/prices because the official Google
  docs return 403 from this environment. The OpenRouter smoke needs `OPENROUTER_API_KEY` and
  `OPENROUTER_MODEL`; the adapter and config tests are already green, but this machine's
  OpenRouter network access is blocked by a security policy (403) from Cloudflare, so a live
  OpenRouter smoke can only run from an allowed network. LM Studio covers local development in
  the meantime. The web AI client already calls the gateway and falls back to `ai_not_ready`
  only when a function is missing; the new public `ai-models` catalog function could not be
  deployed to staging because `supabase functions deploy` fails to bundle the shared `zod`
  import without Docker (relative-import error).
- M8: create the production Supabase project and a protected production GitHub environment.
- PR #7 checks: `Typecheck, lint, test, build`, `Secret scan`, and `Local schema and pgTAP`
  pass. The staging deploy job skips on pull requests by design; after merge, verify the first
  `main` run uses the `staging` environment secrets.
- M0 blockers H2, H3 and H7 are resolved.

## M2/M6 Linux (WSL2) Android toolchain and debug build (2026-10-24)

**Milestone:** the on-device dev-client item is unblocked on the Linux side - the debug APK
builds locally from the Linux filesystem. Device install/run is still pending hardware (no
phone/USB and no Windows emulator during this session).

### Toolchain installed (Linux home folder, nothing under `/mnt/c`)

- Ubuntu 26.04 on WSL2 (kernel `6.6.114.1-microsoft-standard-WSL2`); Node 24.22.1 (nvm),
  pnpm 12.14.0
- `apt`: unzip, zip, curl, git, OpenJDK 17.0.20.1
  (`JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`)
- Android SDK at `~/Android/Sdk`: cmdline-tools 16111833 (Android CLI 1.0.16625370),
  platform-tools 37.0.1 (adb 1.0.41), platforms `android-36` r02 + `android-37.0` r02,
  build-tools 36.0.0 + 37.0.0, NDK 27.1.12297006, CMake 3.22.1; `ANDROID_HOME`,
  `ANDROID_SDK_ROOT` and `PATH` are exported from `~/.bashrc`
- Emulator and system images deliberately not installed (the device lives on Windows)
- `~/.gradle/init.d/android-mirror.gradle` (the known Aliyun/redirector Maven workaround)

### Generated Gradle versions (verified, no mismatch)

AGP 9.2.1 (`@react-native/gradle-plugin` version catalog), Gradle 9.4.1 wrapper, compileSdk 37,
targetSdk 36, minSdk 24, buildTools 37.0.0, NDK 27.1.12297006, CMake 3.22.1 (AGP default).
Expo SDK 58 supplies these defaults in `ExpoRootProjectPlugin`.

### Verification

- [x] `pnpm install` clean in the Linux filesystem
- [x] `npx expo prebuild --platform android` (regenerated `apps/mobile/android`, gitignored)
- [x] mobile typecheck, `expo lint`, 21 vitest tests green
- [x] `npx expo export --platform android` (6.4 MB Hermes bundle)
- [x] `./gradlew :app:assembleDebug`: BUILD SUCCESSFUL, 22m16s cold / 17s incremental
- [x] APK `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`: 241 MB,
      `com.whattocook.app` 0.1.0 (versionCode 1), debug-signed, ABIs armeabi-v7a / arm64-v8a /
      x86 / x86_64, sha256 `aade72ae22bae830075b1a3ee7147daeb4bf7c4caa7a50228a5fb113605d0731`
- [x] Install/run on a Windows-side device over the TCP ADB bridge (2026-10-24): camera + pantry
      upload via the photo picker, chat keyboard, RTL fa/ar, recipe scaling, timer, AI and catalog
      flows. Camera capture itself is still pending.

### Environment deviations found on Linux

- `dl.google.com` returns 404 from this network (same as Windows), so `sdkmanager` and the new
  cmdline-tools bootstrap cannot reach their default URLs. SDK packages were resolved from the
  official index served by `redirector.gvt1.com/edgedl/android/...`, and the CLI bootstrap was
  pointed there with `ANDROID_CLI_DOWNLOAD_URL`. The current Android CLI has no
  `--sdk_url`/`--sdk_index` flags, so packages were unpacked from the index metadata and
  `package.xml` was generated for `platforms;android-37.0`, `ndk;27.1.12297006` and
  `cmake;3.22.1` (those zips do not ship one).
- One Aliyun 502 on a Kotlin plugin marker aborted the first build; that artifact 404s there
  (it is Maven Central only) and the retry succeeded. A later run hung ~20 min on a stalled
  HTTP download (CLOSE-WAIT socket, Gradle has no default read timeout); builds now pass
  `-Dorg.gradle.internal.http.socketTimeout=60000`.
- Copying the repo from Windows left CRLF endings in 211 tracked files; `core.autocrlf=input`
  plus a checkout restored the index (LF) bytes, so the tree is clean.
- `core.sshCommand` pointed at `C:/PROGRA~1/Git/usr/bin/ssh.exe`; it was unset and a WSL
  ed25519 key was added to GitHub.
- ADB bridge: WSL is in NAT mode, Windows host is the default gateway `172.29.176.1`; the
  Windows server runs `adb -a nodaemon server start` with an inbound firewall rule for TCP 5037. Linux adb 37.0.1 matches the Windows 37.0.1 server. No device was attached yet.
- Metro over that bridge needs a Windows port relay (`netsh interface portproxy` 8081 -> WSL
  IP) because `adb reverse` terminates at the Windows adb server, not in WSL;
  `networkingMode=mirrored` in `.wslconfig` is the alternative.
