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
