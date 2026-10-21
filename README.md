# WhatToCook — serverless mobile + web

Independent port of WhatToCook to a serverless stack: an Android app (React Native +
Expo) and a static web app (React + Vite), both backed by Supabase. No servers to operate.

- Reference (read-only): `../WhatToCook-AI-Powered-Recipe-Generator`
- Build plan: `implementation_plan.md` (local-only, untracked)

## Layout

```
apps/web            React + Vite static SPA/PWA
packages/shared     types, i18n, match engine, data/API layer (added over M1–M5)
supabase/           migrations, seed, edge functions (M1+)
docs/               PROGRESS, DECISIONS, porting notes, runbook
```

## Commands

```bash
pnpm install
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @whattocook/web build
pnpm dev:web
```

## Status

M0 — foundations. The web app is a placeholder shell; mobile app starts in M2.
