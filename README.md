# WhatToCook - serverless mobile + web

Independent port of WhatToCook to a serverless stack: an Android app (React Native +
Expo) and a static web app (React + Vite), both backed by Supabase. No servers to operate.

- Reference (read-only): `../WhatToCook-AI-Powered-Recipe-Generator`
- Build plan: `implementation_plan.md` (local-only, untracked)
- Supabase setup: `docs/SUPABASE.md`
- AI HTTP contract: `docs/api.md`
- Operations runbook: `docs/runbook.md`

## Layout

```
apps/web            React + Vite static SPA/PWA
apps/mobile         Expo SDK 58 Android app (Expo Router, auth, i18n, pantry/cook/grocery, AI Chef, scanner)
packages/shared     types, shared translations, AI contracts, database types
supabase/           migrations, seed, tests, catalog images
docs/               PROGRESS, DECISIONS, porting notes, Supabase runbook
```

## Environment

- Root `.env.example` is the full environment contract. Copy it to `.env.local`
  for Supabase CLI/CI and server-side secrets. `.env.local` is gitignored.
- Web: copy `apps/web/.env.example` to `apps/web/.env.local`. Only the public
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_ENV` values are
  needed.
- Mobile: copy `apps/mobile/.env.example` to `apps/mobile/.env.local`. Only
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are needed; the anon
  key is public by design.
- The GitHub Actions `staging` environment needs `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_ID`, and `SUPABASE_DB_PASSWORD`.
- Never put a service-role key or AI provider key in `VITE_*` or
  `EXPO_PUBLIC_*`; those values are public.

## Commands

```bash
pnpm install
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @whattocook/web build
pnpm dev:web

# mobile (Expo)
pnpm dev:mobile            # Metro / Expo Go
pnpm android               # Metro + open on a connected Android device/emulator
cd apps/mobile && npx expo run:android   # native dev client (needs Android SDK)
cd apps/mobile && npx expo export --platform android   # bundle smoke test

# local Supabase (Docker optional; see ADR-006)
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm gen:types

# Edge Functions (local fake provider)
pnpm exec supabase functions serve --env-file supabase/functions/.env --no-verify-jwt
pnpm dlx deno check --config supabase/functions/deno.json supabase/functions/generate-recipe/index.ts
pnpm dlx deno lint --config supabase/functions/deno.json supabase/functions
pnpm dlx deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/tests

# staging types / deploy verification (requires .env.local credentials)
pnpm gen:types:remote
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push --dry-run
```

## Status

M2 - mobile shell complete: the Expo SDK 58 Android app has SecureStore-backed Supabase auth,
five shared locales with RTL handling, a Pantry search/CRUD screen, `can_cook()` match results,
a synced grocery list and Settings. Mobile typecheck, lint, Expo config validation and the
Android Metro export are green; the on-device dev-client build and UI tests are the remaining
M2 items. M5 - mobile AI: an AI Chef tab (pantry ingredients, diet, servings, surprise, free
model selector, quota badge), AI recipe detail with ingredient steps, chef tips, grocery
export, inline substitutions and chat, plus a camera/gallery pantry scanner. These screens
call the Edge Functions directly with the same quota and error semantics; missing functions
degrade to a translated "not connected" state, and `ai-models` falls back to the shared free
catalog. Staging API smoke and the Android bundle pass; mobile helper tests cover the dish
photography helper, and the on-device AI/scanner walkthrough still needs a dev-client build. M4 - AI gateway complete and deployed to staging with the
deterministic `fake` provider. The M0/M1 Supabase foundation (RLS, quota RPCs, matcher,
80-ingredient / 12-recipe catalog, Storage) and the WM1 web parity port are done. The four AI
Edge Functions cover suggestions, recipe detail, chat, streaming, pantry scans, substitutions,
and the client model catalog with a service-role quota/cache path. Gemini, OpenRouter, and
local LM Studio are available as server-side providers; OpenRouter uses `OPENROUTER_API_KEY` /
`OPENROUTER_MODEL` and LM Studio uses `LMSTUDIO_MODEL`, and neither needs a migration. Real
provider traffic is enabled only after the key and model/pricing are verified. The web AI
client calls the gateway and degrades to `ai_not_ready` only if a function is missing. Local
checks currently cover 120 pgTAP tests and 70 Deno tests.
