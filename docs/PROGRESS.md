# Progress

> Local, agent-maintained log. Update at the end of every milestone. The plan itself
> (`implementation_plan.md`) is untracked via `.git/info/exclude`.

## Current

**Milestone:** M0 — foundations and porting analysis (in progress)

## M0 checklist

- [x] Git repo initialized on `main`; plan excluded from version control
- [x] Bootstrap checks: Node 23.7.0, pnpm 12.14.0, git 2.53, gh (logged in), Docker 29.7
- [ ] Section 3 skills/MCP review (human + agent) — Expo/Supabase skills not installed yet
- [x] pnpm workspace: `apps/web`, `packages/shared`
- [x] TypeScript strict base config, ESLint flat config, Prettier, EditorConfig
- [x] Placeholder web app builds (`@whattocook/web`)
- [x] Shared package with locale constants + tests
- [ ] `docs/porting-notes.md` (reference analysis in progress)
- [x] `docs/DECISIONS.md`
- [x] CI skeleton + gitleaks
- [ ] First green CI run on a PR (needs GitHub remote)
- [ ] `CLAUDE.md` (written, review pending)

## Environment notes

- `pnpm` was installed globally with `npm i -g pnpm` because `corepack enable` hit EPERM
  on `C:\Program Files\nodejs` (no admin). Node is 23.7.0 locally while `.nvmrc`/engines target 22 LTS.
- Deno, Supabase CLI, JDK, Android SDK and Maestro are **not installed yet**. Needed by
  M1 (Supabase CLI), M4 (Deno), M7 (JDK/Android). Install before those milestones.
- Reference repo lives at `../WhatToCook-AI-Powered-Recipe-Generator` and is strictly read-only.

## Blocked / waiting on human

- H7: final Android application ID (currently placeholder `com.whattocook.app`, not published).
- H2: GitHub repo creation/branch protection/Dependabot (agent can create the repo on request).
- H3: Supabase staging project (needed for M1).
- H1: Play Console account (needed later).
