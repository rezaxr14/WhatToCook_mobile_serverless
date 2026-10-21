# WhatToCook - serverless mobile + web

Independent port of WhatToCook to a serverless stack: an Android app (React Native +
Expo) and a static web app (React + Vite), both backed by Supabase. No servers to operate.

- Reference (read-only): `../WhatToCook-AI-Powered-Recipe-Generator`
- Build plan: `implementation_plan.md` (local-only, untracked)
- Supabase runbook: `docs/SUPABASE.md`

## Layout

```
apps/web            React + Vite static SPA/PWA
packages/shared     types, i18n, match engine, data/API layer (added over M1-M5)
supabase/           migrations, seed, tests, catalog images
docs/               PROGRESS, DECISIONS, porting notes, Supabase runbook
```

## Environment

- Root `.env.example` is the full environment contract. Copy it to `.env.local`
  for Supabase CLI/CI and server-side secrets. `.env.local` is gitignored.
- Web: copy `apps/web/.env.example` to `apps/web/.env.local`. Only the public
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_ENV` values are
  needed.
- Mobile (M2+): use the `EXPO_PUBLIC_*` block from the root example in
  `apps/mobile/.env.local`.
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

# local Supabase (Docker optional; see ADR-006)
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm gen:types

# staging types / deploy verification (requires .env.local credentials)
pnpm gen:types:remote
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push --dry-run
```

## Status

M1 - backend foundation complete. The local/staging schema, 80-ingredient / 12-recipe catalog,
RLS, quota RPCs, matcher, Storage images, and 102 pgTAP tests are in place. The web app is still
a placeholder; the mobile app starts in M2.
