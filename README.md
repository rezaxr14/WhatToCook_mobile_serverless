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
```

## Status

M1 - backend foundation complete. The local/staging schema, 80-ingredient / 12-recipe catalog,
RLS, quota RPCs, matcher, Storage images, and 102 pgTAP tests are in place. The web app is still
a placeholder; the mobile app starts in M2.
