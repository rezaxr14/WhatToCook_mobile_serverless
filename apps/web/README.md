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
