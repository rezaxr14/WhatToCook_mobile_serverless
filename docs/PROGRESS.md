# Progress

> Local, agent-maintained log. Update at the end of every milestone. The plan itself
> (`implementation_plan.md`) is untracked via `.git/info/exclude`.

## Current

**Milestone:** M1 - backend foundation complete, awaiting review before M2

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

## Staging verification (2026-10-22)

- Catalog counts: 80 ingredients / 12 recipes / 65 recipe-ingredient rows / 3 plans.
- Storage: 12 public recipe images under `recipe-images/recipes/`; every `recipes.image_path`
  resolves to an object.
- Anonymous sign-in + `seed_demo_data()` + `can_cook()`:
  - 0 full matches, 9 partial matches, 11 pantry ingredients.
  - Tuscan Chicken 80%, Fried Rice 71%, Shrimp 67%, Pancakes 67%, Crepes 57%,
    Grilled Cheese 50%, Omelette 50%, Avocado Toast 50%, Affogato 0%.
  - Carbonara, Penne and Shakshuka excluded.
- Test anonymous user deleted after verification; staging domain tables are empty again.
- Security advisors remaining are intentional: authenticated `seed_demo_data()` and
  `delete_my_account_data()` RPCs, and anonymous-sign-in policy notices.
- Performance advisor only reports unused indexes on a fresh, unqueried database.

## Environment notes

- Supabase CLI 2.121.0 is a root dev dependency; use `pnpm exec supabase` or the root scripts.
- Docker Desktop is installed; the local stack is optional day to day (ADR-006). When running:
  DB `54322`, API `54321`, Studio `54323`, container `supabase_db_whattocook`.
- Local Supabase stack was used for M1 reset/test/lint verification and is currently running.
- `dblink` concurrency tests connect via `host=db port=5432` so password auth is used;
  loopback connections match the local trust rule and are rejected by dblink for
  non-superusers.
- Supabase MCP was used for the first staging migration apply because no remote DB password
  is stored locally. MCP creates its own migration versions; staging history was then aligned
  to the four local versions plus the hardening migration. Future applies should use
  `supabase db push` (CI) or the GitHub integration, not MCP, unless history is aligned again.
- Project skills live in `.agents/skills` (14 official Expo/Supabase skills, ADR-007).
- Reference repo lives at `../WhatToCook-AI-Powered-Recipe-Generator` (commit `2e8fa3f`)
  and is strictly read-only.

## Blocked / waiting on human

- Add GitHub repository (or `staging` environment) secrets: `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`. Without them the deploy job warns and skips.
- The Supabase GitHub integration is connected: PR #7 shows a `Supabase Preview` check that
  currently skips. Confirm in the dashboard whether the integration also deploys to production
  on `main`; if it does, choose either it or `.github/workflows/supabase.yml` as the deploy path
  to avoid duplicate pushes. Preview-branch deployments can coexist.
- PR #7 checks: `Typecheck, lint, test, build`, `Secret scan`, and `Local schema and pgTAP`
  pass. The staging deploy job skips on pull requests and also skips without secrets.
- H1: Play Console account (needed later, M7+).
- M0 blockers H2, H3 and H7 are resolved.
