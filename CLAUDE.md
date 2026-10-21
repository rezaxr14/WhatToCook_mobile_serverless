# CLAUDE.md

## What this repo is

`WhatToCook_mobile_serverless` — an Android app (Expo) and a static web app (React + Vite)
on one Supabase backend. The original Django repo is **read-only reference** at
`../WhatToCook-AI-Powered-Recipe-Generator`: never edit, commit to, or deploy from it.

The authoritative plan is `implementation_plan.md` at the repo root. It is **untracked**
(`.git/info/exclude`) and must stay that way. Read it fully before working.

## Layout

- `apps/web` — React 19 + Vite 8 + TS, static SPA/PWA; no server code
- `apps/mobile` — Expo app (M2)
- `packages/shared` — types, zod, i18n, match engine, data/API layer
- `supabase/` — migrations, seed, edge functions (M1+)
- `docs/` — PROGRESS.md, DECISIONS.md, porting-notes.md, api.md, runbook.md, web-hosting.md
- `.agents/skills/` — reviewed project skills (Expo + Supabase), pinned by `skills-lock.json`

## Commands

```bash
pnpm install
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @whattocook/web dev|build|test
```

Web output is `apps/web/dist`. Env vars are public `VITE_*` values only.

## Rules

1. Work milestone by milestone. Start each by restating goal/tasks; end by running
   acceptance checks, updating `docs/PROGRESS.md`, committing, and **stopping for review**.
2. Small conventional commits on branches; PRs against `main`.
3. Verify against current official docs (Expo, Supabase, Vite) — not memory.
4. No secrets in repo, logs, mobile bundle or web bundle. RLS on every table.
   `service_role` only in Edge Functions/CI.
5. Tests are part of done (unit/pgTAP/Deno/E2E as appropriate).
6. Never run destructive commands against staging/prod. No `db reset --linked`.
7. Record non-obvious choices as ADRs in `docs/DECISIONS.md`.
8. Human tasks (Track H in the plan) are not yours: stop and ask with exact requirements.
9. Never modify the reference repo. Copy knowledge, not files, unless a file is a
   licensed asset explicitly approved for reuse.
