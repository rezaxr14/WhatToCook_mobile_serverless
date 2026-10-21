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
database password is not stored on the workstation.

**Decision:** staging is the Supabase project `WhatToCook` (`lderdvhteofqemiivosz`, `eu-west-1`).
Migrations are the source of truth. The catalog seed is a migration, not only `seed.sql`, so
staging receives the same 80 ingredients / 12 recipes / 65 joins through `supabase db push`.
`supabase/seed.sql` stays local-only and documents that the canonical catalog is a migration.

Local verification is `supabase db reset` plus `supabase test db` plus `supabase db lint`.
`.github/workflows/supabase.yml` repeats those checks on pull requests. On `main`, after the
checks and when the three deploy secrets exist, it runs `supabase link` + `supabase db push`
and re-uploads the 12 catalog images. The repository `staging` environment can hold those
secrets and require approval. Without secrets the deploy job warns and skips instead of failing.

The Supabase MCP is a fallback for one-off remote DDL when no DB password is available. MCP
records its own timestamped migration versions, so after an MCP apply the staging
`supabase_migrations.schema_migrations` history must be aligned to the local file versions.
Normal changes after M1 should use the CI push or the GitHub integration, not MCP.

**Consequences:** `supabase db push` sees the local versions as already applied. The workflow's
image upload is idempotent by removing each object before `storage cp` (the command is
experimental and does not upsert). If the Supabase GitHub integration is configured to deploy
to production on `main`, either disable that behaviour or remove the workflow deploy job to
avoid two deploy paths; preview-branch deployments can coexist. The workstation can verify
staging through SQL/MCP and the REST API without ever storing the DB password.

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
