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
apps/mobile         Expo SDK 58 Android app (Expo Router, auth, i18n, pantry/cook/grocery, recipe catalog/detail, AI Chef, scanner)
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

### Android toolchain (Linux / WSL2)

A local debug build works from the Linux home folder; nothing lives under `/mnt/c`.
Versions are pinned by the generated Gradle files, not by this table.

| Tool                   | Version                                          | Location                             |
| ---------------------- | ------------------------------------------------ | ------------------------------------ |
| Ubuntu / kernel        | 26.04 LTS / 6.6.114.1-microsoft-standard-WSL2    | -                                    |
| Node / pnpm            | 24.22.1 / 12.14.0                                | nvm                                  |
| JDK                    | OpenJDK 17.0.20.1                                | `/usr/lib/jvm/java-17-openjdk-amd64` |
| Android SDK            | cmdline-tools 16111833, Android CLI 1.0.16625370 | `~/Android/Sdk`                      |
| platform-tools / adb   | 37.0.1 (adb 1.0.41)                              | `~/Android/Sdk/platform-tools`       |
| Platforms              | android-36 (r02), android-37.0 (r02)             | `~/Android/Sdk/platforms`            |
| Build-tools            | 36.0.0, 37.0.0                                   | `~/Android/Sdk/build-tools`          |
| NDK / CMake            | 27.1.12297006 / 3.22.1                           | `~/Android/Sdk/{ndk,cmake}`          |
| Gradle (wrapper) / AGP | 9.4.1 / 9.2.1                                    | project                              |

`~/.bashrc` exports `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT` and puts
`cmdline-tools/latest/bin` and `platform-tools` on `PATH`.

Build the debug APK:

```bash
cd apps/mobile && npx expo prebuild --platform android
cd android && ./gradlew :app:assembleDebug
# apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk (all 4 ABIs)
```

Install on a device that is visible to the Windows adb server (WSL2 NAT mode):

```bash
# Windows (PowerShell): adb kill-server; adb -a nodaemon server start
# Windows (admin, once): New-NetFirewallRule -DisplayName "WSL ADB 5037" `
#   -Direction Inbound -Protocol TCP -LocalPort 5037 -Action Allow
export ADB_SERVER_SOCKET=tcp:$(ip route show default | awk '{print $3}'):5037
adb devices
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

`adb reverse` targets the Windows adb server, not WSL, so Metro needs either a
Windows `netsh interface portproxy` relay to the WSL IP or
`networkingMode=mirrored` in `%UserProfile%\.wslconfig`.

Network workarounds in this environment (details in `docs/PROGRESS.md`):
`dl.google.com` returns 404, so SDK packages come from `redirector.gvt1.com` and
Maven artifacts from the Aliyun mirrors configured in
`~/.gradle/init.d/android-mirror.gradle`. Gradle distributions come from
`services.gradle.org` and are unaffected.

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
pnpm android               # expo run:android (native debug build + install, needs the SDK)
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
photography helper, and the on-device AI/scanner walkthrough still needs a dev-client build.
M6 - mobile recipe catalog: a searchable `/recipes` screen with quick, vegetarian and sweet
filters, plus a `/recipe/[id]` detail screen with serving scaling, pantry-aware ingredient
checklists, inline substitutions, missing-only grocery export, step completion, an in-app
step timer and chat. The Cook tab links to the catalog and its matched cards open the detail
screen. The shared chat, timer and substitute panels are reused by the AI recipe detail;
typecheck, lint, 21 mobile helper tests, 12 shared tests, the Android export and a
headless-browser catalog/detail smoke are green. The on-device catalog walkthrough and
RNTL/Maestro coverage remain.
M4 - AI gateway complete and deployed to staging with the
deterministic `fake` provider. The M0/M1 Supabase foundation (RLS, quota RPCs, matcher,
80-ingredient / 12-recipe catalog, Storage) and the WM1 web parity port are done. The four AI
Edge Functions cover suggestions, recipe detail, chat, streaming, pantry scans, substitutions,
and the client model catalog with a service-role quota/cache path. Gemini, OpenRouter, and
local LM Studio are available as server-side providers; OpenRouter uses `OPENROUTER_API_KEY` /
`OPENROUTER_MODEL` and LM Studio uses `LMSTUDIO_MODEL`, and neither needs a migration. Real
provider traffic is enabled only after the key and model/pricing are verified. The web AI
client calls the gateway and degrades to `ai_not_ready` only if a function is missing. Local
checks currently cover 120 pgTAP tests and 70 Deno tests.
