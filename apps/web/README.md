# @whattocook/web

Static, serverless web client: React + Vite + TypeScript. It talks directly to
Supabase (PostgREST/RLS, RPC, Storage and Edge Functions) and has no custom
server runtime.

## Run

```bash
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
pnpm --filter @whattocook/web dev
pnpm --filter @whattocook/web build
pnpm --filter @whattocook/web test
```

The anon/publishable key is public and ends up in the bundle. Never put the
service-role key or an AI provider key in `apps/web/.env.local`.

## WM1 status

The reference React UI is in place and reads real Supabase catalog data:

- Public catalog: recipes, ingredients, recipe detail and Supabase Storage images.
- Auth: email/password sign-in, sign-up, and anonymous guest demo with
  `seed_demo_data()`.
- Pantry: read/add/remove/clear against `pantry_items` under RLS.
- Matcher: `can_cook()` RPC, preserving the reference `missing_count <= 2 OR
match_pct >= 50` semantics.
- Grocery list: `grocery_items` sync with localStorage fallback and recipe source
  links.
- AI Chef / fridge scanner / sous-chef pages are ported, but the M4 AI gateway is
  not deployed yet. They fail with a friendly `ai_not_ready` state instead of
  calling a missing server.
- Telegram bot is a planned M10 feature; the modal explains the current status.

## Build

`pnpm build` typechecks, bundles, then writes `dist/robots.txt` and - when
`VITE_SITE_URL` is set (for example `https://whattocook.app`) - `dist/sitemap.xml`.
Without it the sitemap is skipped and the build is unchanged.

`public/_headers` carries the baseline security/caching headers for hosts that
support the file (Netlify, Cloudflare Pages). A CSP is intentionally left to the
host because it has to allow the Supabase origin.

## Deploy (GitHub Pages)

`.github/workflows/web-pages.yml` builds the app and publishes `apps/web/dist` to
GitHub Pages on every push to `main` that touches the web app, shared package or
lockfile. The live site is:

https://rezaxr14.github.io/WhatToCook_mobile_serverless/

The workflow sets `VITE_BASE_PATH=/WhatToCook_mobile_serverless/` so Vite, React
Router and `manifest.json` resolve under the project path, and copies
`index.html` to `404.html` so deep links (`/recipes`, `/recipe/1`) fall back to
the SPA. It needs two repository secrets: `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`.

Supabase Auth's site URL and redirect allow list must include the Pages URL;
that is configured in the dashboard/Management API, not in this repo. Email
sign-up confirmations return to `window.location.origin + BASE_URL`, so local
dev (`http://localhost:5173`) keeps working too.

GitHub Pages cannot send custom response headers, so `public/_headers` is unused
there. Use a host that supports it (Netlify/Cloudflare Pages) if you need HSTS
or a CSP.
