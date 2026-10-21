# Porting notes — Django reference → Supabase mobile + web

Reference: `../WhatToCook-AI-Powered-Recipe-Generator` at commit `2e8fa3f` (`main`).
**Read-only.** Nothing in this repo imports from or writes to it.

This document is the knowledge transfer for the reimplementation. It is filled in during M0 and
kept current when behavior intentionally diverges.

## 0. Snapshot

- Django 5.2 + DRF, PostgreSQL 15 / SQLite fallback, Celery + Redis (AI and maintenance queues),
  nginx serving the SPA and proxying `/api`, `/media`.
- React 18 + TS + Vite + Tailwind 4 + TanStack Query frontend, 5 locales with RTL, PWA.
- AI: Gemini via `google-genai` with a raw REST fallback; optional LM Studio (not ported in v1).
- 12 seeded catalog recipes, 80 canonical ingredients, 65 recipe-ingredient rows, photos in
  `media/recipes/`. The checked-in `db.sqlite3` is the canonical snapshot (it has image bindings
  and the 11-item `ChefDemo` pantry that `seed_recipes` alone does not create).
- Core AI features: pantry suggestions, full recipe detail, SSE recipe stream, fridge-photo scan,
  recipe chat (which also answers substitutions), Telegram bot.
- There is **no token/cost accounting, no per-user spend quota and no global budget** today.
  Our gateway adds all of that (plan §5.3–5.4).

## 1. AI gateway (reference behavior)

### 1.1 Configuration

From `WhatToCook/settings.py:318–324` and `GetFood/ai_service.py:14–31`:

| Setting          | Default                                                | Notes                            |
| ---------------- | ------------------------------------------------------ | -------------------------------- |
| `AI_PROVIDER`    | `gemini`                                               | `gemini` or `lmstudio`           |
| `GEMINI_API_KEY` | empty                                                  | never committed                  |
| `GEMINI_MODEL`   | `gemini-3.5-flash-lite`                                | verify against live `ListModels` |
| `LMSTUDIO_URL`   | `http://host.docker.internal:1234/v1/chat/completions` | local model, non-goal for v1     |
| `MODEL_NAME`     | `llama-3.2-3b-instruct`                                | LM Studio model id               |

Fallback model ladder (`ai_service.py:20–31`), de-duplicated in order:
`explicit model → GEMINI_MODEL → gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.5-flash,
gemini-3.1-flash-lite, gemini-2.5-flash-lite, gemini-2.5-flash, gemini-2.0-flash-lite,
gemini-2.0-flash, gemini-flash-latest`.
Several IDs are non-standard; **re-validate at M4** and store models/prices in `ai_model_prices`,
not in code.

### 1.2 Call strategy

Text calls (`_call_gemini_with_meta`, `ai_service.py:94–203`):

1. Try each candidate model through the `google-genai` SDK with `temperature 0.7` and
   `response_mime_type: application/json` (for structured features).
2. Then try every candidate again through the raw REST API:
   `POST /v1beta/models/{model}:generateContent?key=…`, 30 s timeout.
3. Parse `candidates[0].content.parts[0].text`.
4. 429/quota detection is substring-based over `429`, `quota`, `resource_exhausted`,
   `rate limit`, `too many requests`; failing models are returned to the client as
   `rate_limited_models`, and the SPA disables them for the session.
5. If all models fail: `ValueError("All Gemini models failed…")`.

Vision calls (`_call_gemini_vision`, `ai_service.py:222–317`): same two-pass loop, **always**
starts at `GEMINI_MODEL`, `temperature 0.4`, no `responseMimeType`, inline image data,
45 s REST timeout. No EXIF handling, no resize, no storage.

Streaming (`ai_service.py:705–787`): Gemini-only, **single model, no fallback ladder**,
`streamGenerateContent?alt=sse`, 60 s timeout. Any failure mid-stream falls through to a canned
markdown recipe streamed word-by-word.

No timeouts/token caps/safety settings on SDK path; no retries/backoff; no `Retry-After` handling.

### 1.3 Prompts (port verbatim unless noted)

All prompts get a language directive as `system_instruction` suffix for non-English locales
(`ai_service.py:52–91`):

> LANGUAGE REQUIREMENT: You MUST respond entirely in {language}. Write ALL human-readable text
> (titles, dish names, descriptions, steps, tips, quantities, categories) in {language}. For JSON
> outputs keep the JSON keys exactly as specified (English keys) but every string VALUE must be
> written in {language}. Do not mix English words into the values.

**Suggestions** (`ai_service.py:405–415`):

> You are a master creative chef. Based on these available pantry ingredients: {comma-joined
> ingredients}, suggest 5 realistic, enticing, and distinct dishes that can be cooked. Return ONLY
> a JSON array with objects containing: 'name' (str), 'short_description' (str), 'cuisine' (str),
> 'difficulty' (Easy/Medium/Hard), 'prep_time' (e.g. '25 mins'), 'image_hint' (e.g. 'pasta',
> 'chicken', 'salad', 'soup').

System: `You are a professional culinary chef. Always respond with clean, valid JSON without markdown formatting.`

**Recipe detail** (`ai_service.py:491–507`):

> You are a Michelin-star master chef. Provide a comprehensive cooking recipe for
> '{recipe_name}'. Return valid JSON with the following exact keys:
>
> - 'name': string
> - 'description': mouthwatering 2-3 sentence overview
> - 'cuisine': string (e.g. Italian, Asian, Mexican)
> - 'difficulty': 'Easy' | 'Medium' | 'Hard'
> - 'time_minutes': integer (total cooking time in minutes)
> - 'ingredients': list of objects, each with {'name': string, 'amount': string, 'unit': string}
> - 'instructions': list of objects, each with {'step': string, 'time_minutes': integer or null, 'chef_tip': string or null}
> - 'nutrition': object with {'calories': string, 'protein': string, 'carbs': string, 'fat': string}
>   Return ONLY raw JSON, no markdown formatting.

System: `You are a professional chef. Always output valid structured JSON without markdown wrappers.`

**Vision / pantry scan** (`ai_service.py:626–649`; adds a translated `display_name` field for
non-English):

> You are an expert culinary AI and kitchen computer vision assistant. Analyze this image of a
> refrigerator, kitchen pantry, grocery haul, or countertop. Identify all visible food ingredients,
> fresh produce, dairy, meats, seasonings, condiments, and groceries. Return ONLY a clean JSON array
> with objects containing:
>
> - 'name': standardized singular ingredient name in English Title Case (e.g. 'Egg', 'Tomato', 'Cheddar Cheese', 'Milk', 'Bell Pepper', 'Garlic', 'Chicken Breast', 'Avocado', 'Butter', 'Onion', 'Lemon')
> - 'category': one of ['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Grains & Pasta', 'Pantry & Spices', 'Condiments', 'Bakery', 'Beverage', 'Other']
> - 'confidence': float between 0.0 and 1.0 (estimated confidence of detection)
> - 'estimated_quantity': string or null (e.g. '6 eggs', '2 bottles', '1 bag')
>   The 'name' field MUST always be in English regardless of any other language requirement. Return
>   ONLY the JSON array, no conversational text or markdown code blocks.

System: `You are an expert culinary AI and kitchen computer vision assistant. Always respond with clean, valid JSON.`

**Stream** (`ai_service.py:713–721`):

> You are a Michelin-star master chef. Provide a step-by-step gourmet recipe for '{recipe_name}'.
> Include a description, cooking time, ingredients with measurements, sequential numbered cooking
> steps with chef tips, and a calorie & macro estimate. Format cleanly.

System: `You are a Michelin-star master chef writing a beautifully formatted recipe.`

**Chat / substitution** (`ai_service.py:810–820`): system prompt embeds recipe name, ingredients
and steps as JSON, then instructs the model to answer warmly about substitutions, flavor boosts,
techniques, pairings, dietary conversions, appliance adaptations, storage and heat. User message is
the last 6 turns + the new question, plain markdown output.

Notes:

- Dietary preferences are **not** an input anywhere today; servings are **never** sent to the model.
  The UI assumes a base of 4 and scales amounts client-side.
- The separate "substitution modal" in the reference is hard-coded, not AI.

### 1.4 Output handling and degradation

- Strip markdown fences; accept JSON arrays or `{dishes|recipes: [...]}`; on parse error salvage
  objects with a `name` via regex; recipe detail retries with `unicode_escape`; anything else falls
  back to canned content.
- Degraded answers (provider starts with `fallback`) are **delivered but never cached**.
- Suggestion failure falls back to 5 canned presets; detail, scan, stream and chat each have their
  own canned fallback. The client generally cannot tell except by the content.
- In our port, fallbacks must be explicit: `provider: "fallback"`, never cached, and counted as a
  failed AI call in metrics. Zod validation replaces regex salvage, with one repair attempt.

## 2. Streaming

Reference endpoint: `GET /api/ai/stream/recipe/?recipe=&provider=&language=` (`views.py:1328–1347`),
`text/event-stream` with `Cache-Control: no-cache` and `X-Accel-Buffering: no`. Frames:

```
data: {"chunk": "Hello ", "done": false}\n\n
data: {"chunk": "", "done": true}\n\n
```

No heartbeat, no `event:` field, no disconnect handling, no idempotency, and the fallback can be
appended after partial live output. Nginx disables buffering and uses a 1 h read timeout.

Frontend consumer (`frontend/src/hooks/useAIStream.ts`) splits each network read on `\n` without a
carry-over buffer (a frame split across reads corrupts output), and `done` does not stop the reader.
The hook is currently unused by any page.

**Port:** we stream NDJSON (`{"type":"meta"|"delta"|"final"|"error"}`) from the gateway, per plan
§5.3, with `AbortController`, early first byte, heartbeat comments if needed, and a persistent
buffer in the client. Streaming is a first-class feature in both clients (M5/WM3), not dormant.

## 3. Pantry scan

Reference endpoint `POST /api/pantry/scan-image/` (`views.py:431–522`), multipart `image` or
`image_base64`, optional `auto_add`, `language`; `provider` is accepted but ignored — always Gemini.

- Limits: 8 MiB default (`SCAN_MAX_BYTES`), `image/*` only, <32 bytes rejected; Django body caps
  12 MiB/6 MiB. 413/400 messages are explicit.
- No EXIF stripping, no compression, no persistence: bytes go to Gemini inline data and are dropped.
- `name.strip().title()`, category default `Produce`, confidence default 0.9, unsafe `float()`;
  no threshold, no de-duplication, exact-string catalog matching (`Egg` vs `Eggs` creates duplicates).
- UI reviews detections, lets the user deselect, then adds each ingredient individually.
- Canned 9-item fallback on error or empty output.

**Port:** compress on client (≤1–2 MB, longest edge ~1280–1600 px), strip EXIF in the Edge Function,
map to canonical `ingredients` case-insensitively with a confidence threshold, never auto-add
without confirmation, discard the image after processing (privacy), zod-validate output.

## 4. Rate limits, caching, idempotency (reference)

Rate table (`GetFood/rate_limits.py:21–52`): suggestions/detail/chat `12/min` + `150/day`; stream
`12/min` + `60/hour` (no daily); scan `5/min` + `40/day`; metadata `60/min`; telegram webhook
`120/min`. 429 body:
`{"error":"rate_limited","detail":"…","retry_after":42}` + `Retry-After` header.
DRF throttle identity is user id when authenticated, else `REMOTE_ADDR` (proxy-unaware; behind
Supabase this would collapse to one bucket — we must key on JWT `sub` and trusted IP).

Caching: Redis hot layer + `AISuggestionCache` Postgres table, 24 h TTL; keys are SHA-256 of
sorted lowercased ingredient names + provider/model/language (suggestions) or
recipe/provider/model/language (detail). Only non-degraded answers are cached. Task ids cached
15 min. **Retention is inconsistent in the reference:** the API reads only rows newer than 1 day,
a `post_save` signal purges everything older than 3 days, and the Celery housekeeping task
defaults to 7 days. Pick one policy in the port (plan: 7 days, scheduled purge).
No idempotency keys for scan/chat/stream; Telegram `update_id` is not deduped.

Full scope table (`rate_limits.py:21–52`): `catalog 240/min`, `auth 15/min`, `signup 5/hour`,
`demo 20/min`, `ai_meta 60/min`, `ai 12/min`, `ai_hour 60/hour`, `ai_day 150/day`,
`can_cook 60/min`, `scan 5/min`, `scan_day 40/day`, `pantry 90/min`, `shopping 180/min`,
`telegram_webhook 120/min`. The `stats` and `telegram_link` scopes are defined but unused:
`/api/stats/`, `/api/health/`, `/api/auth/me/`, AI task status and the live Telegram link
endpoint are unthrottled. DRF `SimpleRateThrottle` gives a rolling window; identity is `u<pk>`
or `REMOTE_ADDR` (no trusted-proxy handling).

**Port:** our design replaces this with `reserve → call → settle`, per-user quotas from `plans`,
global daily cap, kill switch, `Idempotency-Key`, and `ai_response_cache` with the same
normalization inputs plus locale/dietary/servings, per plan §5.4. Rate limits stay as a second layer.

## 5. Telegram bot (deferred to M10)

- Link: `GET|POST /api/telegram/link/` creates a stable `secrets.token_urlsafe(16)` token with no
  expiry; returns `connect_url` (`https://t.me/{bot}?start={token}`), `direct_tg_url`, `web_tg_url`.
  Anonymous users get the shared demo account's token.
- Webhook: `POST /api/telegram/webhook/`, secret header
  `X-Telegram-Bot-Api-Secret-Token` is checked **only if** `TELEGRAM_WEBHOOK_SECRET` is set.
- Commands, checked by prefix in order: `/start <token>`, `/start`, `/pantry`, `/add <item>`,
  `/remove <item>`, `/cook` (top 4 AI suggestions, English only), help fallback. Unlinked chats get a
  locked message. `/add` and `/remove` are case-insensitive only on remove.
- `TelegramAccountLink` is OneToOne user with unique nullable `telegram_chat_id`, unique token,
  `is_active`.
- Replies use `parse_mode: Markdown` (no escaping, no 4096-char splitting), 10 s timeout.
- The polling management command deletes the webhook and re-posts updates, but would fail the
  secret check when one is configured.

**Port (M10):** Edge Function webhook with required constant-time secret compare, `update_id`
dedupe, token TTL/rotation, `is_active` check on link, per-chat limits, Markdown escaping and
message splitting, and quota-metered AI through the gateway.

## 6. Data model (reference)

Seven domain models plus Django's `auth.User`. Default BigAutoField PKs, no soft deletes, no
custom user model, no timestamps on catalog/pantry rows.

| Table                         | Key columns / constraints                                                                       | Notes                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GetFood_ingredient`          | `name` unique (case-sensitive), `calories_per_100g` float nullable, `category` text             | Match identity is the numeric `id`, never a normalized name                                             |
| `GetFood_recipe`              | `name` **not** unique, `description`, `cooking_time` nullable, `instructions`, `image`          | Seed upserts by exact name; duplicate names are possible                                                |
| `GetFood_recipeingredient`    | FK recipe/ingredient, `quantity` text (default `to taste`), `unit` text (default `g`)           | **No unique `(recipe, ingredient)`**; matcher dedupes by set                                            |
| `GetFood_userpantry`          | `user` OneToOne, M2M `ingredients`                                                              | One pantry per user, created lazily                                                                     |
| `GetFood_aisuggestioncache`   | `ingredients_hash` unique, `ai_response` JSON, `created_at`                                     | `post_save` purges rows older than 3 days                                                               |
| `GetFood_telegramaccountlink` | `user` OneToOne, `telegram_chat_id` unique nullable, `auth_token` unique, `is_active`           | Token stable, no expiry; see §5                                                                         |
| `GetFood_shoppinglistitem`    | `user` nullable FK, `session_key` text, name/category/quantity/checked/added_from, `created_at` | Owner is either user **or** session key, enforced only in views; ordering unchecked first, newest first |

`RecipeIngredient.quantity` is a string despite looking numeric; neither quantity nor unit is used
for matching. Deleting a recipe/ingredient cascades join rows; deleting a user cascades pantry,
Telegram link and shopping rows. `Recipe.image` stores `recipes/<file>`; the serializer returns it
as a same-origin `/media/...` path.

**Port mapping:** `auth.users` UUID + `public.profiles` (username unique, email), so all owner FKs
become UUID. Keep `quantity`/`unit` as `text`. Add `unique(recipe_id, ingredient_id)` if duplicates
are not wanted (it does not change match percentages, which already dedupe). Decide whether recipe
names become unique. Preserve shopping ordering (`checked asc, created_at desc`) or use an explicit
`position`.

## 7. Match engine ("can cook")

Authoritative code: `GetFood/views.py:529–592`. There is **no separate engine module** and **no
normalization of any kind**.

Input resolution:

- Authenticated request → that user's pantry.
- Anonymous request → the pantry of `ChefDemo` (or empty if missing).
- No request body/query parameters; the client cannot pass ingredients.
- Pantry is a set of ingredient **IDs**.

Per recipe:

1. Load all recipes (no published/active filter).
2. Required set = distinct `ingredient_id` values of its `RecipeIngredient` rows. Skip recipes with
   zero ingredients.
3. `matched = required ∩ pantry`, `missing = required − pantry`.
4. `match_pct = round(len(matched) / len(required) * 100)` using **Python banker's rounding**
   (`62.5 → 62`).
5. Full match iff `missing_count == 0`.
6. Partial iff `missing_count <= 2` **OR** `match_pct >= 50`. This is an OR, so a 0% recipe with
   two missing ingredients is included. A 3-missing, ≥50% recipe is also included.
7. Sort partials by percentage descending only (stable; ties keep DB order). Fulls are unsorted.
8. Return `full_matches`, `partial_matches`, `pantry_ingredient_count` (all pantry items, including
   unused ones), `total_full_matches`, `total_partial_matches`; add `match_percentage`,
   `missing_count`, `missing_ingredients[]`, `matched_ingredients[]` to each recipe.

No synonyms, plurals, case folding, unit conversion, quantity checks, substitutions or assumed
staples. `Egg` ≠ `Eggs`; `Cheese` ≠ `Cheddar Cheese`; `Olive Oil` satisfies any quantity. Duplicate
recipe-ingredient rows count once. The legacy HTML `/legacy/can_cook/` matcher is different
(full-only, 6 per page) and is **not** the reference for the API.

Our `can_cook()` RPC should be a single aggregate query using `FILTER (WHERE pantry...)`, preserve
the OR condition and 0% behavior, skip empty recipes, and return the same snake_case shape. Do not
"improve" matching silently; normalization would be a versioned product change.

Expected seeded result (11-item demo pantry): **0 full**, **9 partial**, **3 excluded**.

| Partial recipe                        | Matched/required |     % | Missing                          |
| ------------------------------------- | ---------------: | ----: | -------------------------------- |
| Tuscan Garlic Herb Chicken Skillet    |              4/5 |    80 | Parmesan                         |
| Savory Garlic Fried Rice with Egg     |              5/7 |    71 | Soy Sauce, Black Pepper          |
| Mediterranean Sautéed Garlic Shrimp   |              4/6 |    67 | Shrimp, Bread                    |
| Fluffy Buttermilk Breakfast Pancakes  |              4/6 |    67 | Sugar, Maple Syrup               |
| Warm Banana Rum Crepes a la Mode      |              4/7 |    57 | Banana, Honey, Vanilla Ice Cream |
| Artisan Garlic Butter Grilled Cheese  |              2/4 |    50 | Bread, Cheddar Cheese            |
| Golden French Cheesy Omelette         |              2/4 |    50 | Cheddar Cheese, Black Pepper     |
| Avocado & Poached Egg Sourdough Toast |              3/6 |    50 | Bread, Avocado, Black Pepper     |
| Classic Affogato al Caffe             |              0/2 | **0** | Vanilla Ice Cream, Cocoa Powder  |

Excluded: Carbonara (2/6, 4 missing), Pomodoro Penne (2/5, 3 missing), Shakshuka (2/7, 5 missing).

## 8. Seed catalog

Canonical source: `seed_recipes.py` plus the checked-in `db.sqlite3` snapshot (the DB also has image
bindings and the demo pantry). Counts: **80 ingredients, 12 recipes, 65 recipe-ingredient rows,
11 demo pantry items**.

Categories: Produce 25, Dairy & Eggs 13, Meat & Seafood 11, Grains & Pasta 12, Pantry & Spices 19.
Distinct names matter: `Cheddar Cheese` (not `Cheese`), `Bread` vs `Sourdough Bread`, `Pasta` vs
`Spaghetti`, `Rice` vs `Jasmine Rice`, `Eggs` (not `Egg`), `Fresh Basil` (not `Basil`).

|   # | Recipe                                     | Min | Ingredients `(name, quantity, unit)`                                                                                      |
| --: | ------------------------------------------ | --: | ------------------------------------------------------------------------------------------------------------------------- |
|   1 | Artisan Garlic Butter Grilled Cheese       |  15 | Bread 2 slices; Cheddar Cheese 75 g; Butter 2 tbsp; Garlic 2 cloves                                                       |
|   2 | Golden French Cheesy Omelette              |  10 | Eggs 3 pcs; Cheddar Cheese 50 g; Butter 1 tbsp; Black Pepper 1 pinch                                                      |
|   3 | Tuscan Garlic Herb Chicken Skillet         |  25 | Chicken Breast 400 g; Garlic 4 cloves; Olive Oil 2 tbsp; Butter 1 tbsp; Parmesan 30 g                                     |
|   4 | Classic Italian Creamy Carbonara           |  20 | Pasta 250 g; Eggs 3 pcs; Bacon 100 g; Parmesan 60 g; Black Pepper 1 tsp; Olive Oil 1 tbsp                                 |
|   5 | Rustic Pomodoro Penne Pasta                |  18 | Pasta 300 g; Tomato Sauce 250 ml; Garlic 3 cloves; Olive Oil 2 tbsp; Parmesan 40 g                                        |
|   6 | Mediterranean Sautéed Garlic Shrimp        |  12 | Shrimp 350 g; Garlic 5 cloves; Olive Oil 3 tbsp; Butter 1 tbsp; Salt 1 tsp; Bread 2 slices                                |
|   7 | Avocado & Poached Egg Sourdough Toast      |  10 | Bread 2 slices; Avocado 1 whole; Eggs 2 pcs; Olive Oil 1 tsp; Salt 1 pinch; Black Pepper 1 pinch                          |
|   8 | Savory Garlic Fried Rice with Egg          |  15 | Rice 300 g; Eggs 2 pcs; Garlic 4 cloves; Butter 1.5 tbsp; Olive Oil 1 tbsp; Soy Sauce 1 tbsp; Black Pepper 1 tsp          |
|   9 | Gourmet Shakshuka with Feta & Crusty Bread |  22 | Eggs 3 pcs; Tomato Sauce 300 ml; Bell Pepper 1 whole; Garlic 3 cloves; Olive Oil 2 tbsp; Feta Cheese 50 g; Bread 3 slices |
|  10 | Fluffy Buttermilk Breakfast Pancakes       |  15 | Flour 200 g; Milk 250 ml; Eggs 2 pcs; Butter 3 tbsp; Sugar 2 tbsp; Maple Syrup 3 tbsp                                     |
|  11 | Classic Affogato al Caffe                  |   5 | Vanilla Ice Cream 2 scoops; Cocoa Powder 1 tsp                                                                            |
|  12 | Warm Banana Rum Crepes a la Mode           |  15 | Flour 120 g; Milk 200 ml; Eggs 2 pcs; Banana 2 whole; Butter 2 tbsp; Honey 2 tbsp; Vanilla Ice Cream 2 scoops             |

Demo pantry: Butter, Chicken Breast, Eggs, Flour, Garlic, Milk, Olive Oil, Onion, Rice, Salt, Tomato.
The bootstrap list asks for 12 names including `Cheese`, which does not exist in the catalog; that
is why the pantry has 11 items.

Images: `media/recipes/{grilled_cheese,omelette,chicken_skillet,carbonara,penne_pomodoro,
garlic_shrimp,avocado_toast,garlic_fried_rice,shakshuka,pancakes,affogato,banana_crepes}.jpg` plus
`default.png`. The checked-in DB binds them, but `seed_recipes` itself never sets `Recipe.image`
(the README is wrong). `seed_data.py` is a destructive legacy seeder with missing ingredient
references — do not use it.

**Port:** import the 80/12/65 snapshot into a seed migration or SQL file (generated from the
reference), upload images to a public Storage bucket, store stable paths/URLs, seed the real 11-item
demo pantry, and assert 80/12/65 plus the 0/9/3 can-cook result in tests.

## 9. HTTP API surface (reference)

All routes are same-origin, session-cookie auth, `AllowAny` globally, no pagination, filtering or
ordering. JSON is snake_case. Recipe payloads include both `image` and `image_url`, nested
`ingredients`, and `recipe_ingredients` (`quantity`/`unit`).

| Area     | Routes                                                                                                                                                          | Notes                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Catalog  | `GET /api/ingredients/`, `/api/ingredients/{id}/`, `/api/recipes/`, `/api/recipes/{id}/`                                                                        | Public; ordered by name; bare arrays                                                                                      |
| Pantries | `GET /api/pantries/`, `/api/pantries/{id}/`                                                                                                                     | **Leaks every user's pantry and email**; do not port                                                                      |
| Platform | `GET /api/stats/`, `/api/health/`                                                                                                                               | Unthrottled; stats cached 60 s; health 503 only if DB down                                                                |
| Auth     | `POST /api/auth/login/`, `/signup/`, `/logout/`, `/demo/`; `GET /api/auth/me/`                                                                                  | 15/min auth, 5/hour signup, 20/min demo; demo logs in `ChefDemo`; signup skips password validators                        |
| Pantry   | `GET /api/pantry/`; `POST /add/`, `/remove/`, `/clear/`, `/scan-image/`                                                                                         | Guests read/write `ChefDemo`; add accepts `ingredient_id`, `name`, or `ingredient_ids`; scan 5/min + 40/day               |
| Match    | `GET /api/can-cook/`                                                                                                                                            | 60/min; §7                                                                                                                |
| AI       | `GET /api/ai/providers/`, `/models/`, `/suggestions/`, `/recipe/{name}/`, `/task-status/{id}/`, `/stream/recipe/`; `POST /api/ai/suggestions/`, `/recipe-chat/` | Suggestions/detail/chat 12/min + 150/day; stream 12/min + 60/hour; task status and metadata notes in §1–4                 |
| Shopping | `GET /api/shopping-list/`; `POST /add/`, `/sync/`, `/clear/`; `PATCH/PUT /{id}/`; `DELETE /{id}/delete/`                                                        | 180/min; user or Django session owner; `checked` uses `bool()` so `"false"` is true; DELETE clear reads only query string |
| Telegram | `GET                                                                                                                                                            | POST /api/telegram/link/`; `POST /api/telegram/webhook/`                                                                  | Live link endpoint unthrottled; webhook 120/min; §5 |

Quirks to fix deliberately, not copy: `/api/pantries/` privacy leak; email in user payloads;
unthrottled live Telegram link; `GET /api/ai/suggestions/` ignores the documented `ingredients`
query param; shopping item IDs are strings; `sync` deletes and recreates rows; empty/whitespace
pantry names can create empty ingredients; scan infers MIME without magic-byte checks.

**Port:** expose catalog via PostgREST/RLS, keep one `can_cook()` RPC, use Edge Functions for AI,
scan and Telegram, and replace Django sessions with Supabase Auth. Either keep compatibility shapes
(useful while porting UI) or version a cleaner API. Never expose a pantries collection endpoint.

## 10. Frontend (reference SPA)

Stack: React 18.3, React Router 7 (`react-router` imports), Vite 6, TypeScript 5.7, Tailwind v4
(no config file; tokens in `src/index.css`), styled-components, framer-motion, lucide-react,
i18next 26 with 5 locales (`en/tr/fa/ar/es`, RTL for fa/ar), TanStack Query installed but unused,
and a lazy three.js landing journey.

Routes: `/` (cinematic landing), `/recipes`, `/can-cook`, `/pantry`, `/ai-chef` (+ `/aichef`,
`/ai` aliases), `/recipe/:id`, `/ai-recipe/:name`, `/auth`, `*`. Only landing and 404 are eager; all
other pages are lazy with a spinner fallback. Static hosts must rewrite every path to `index.html`.

Providers: `QueryClient → Toast → Auth → Pantry → ShoppingList → Language → Router`. There is **no
protected-route wrapper**; pages simply render empty/guest states when calls fail.

Data layer: five hand-written API modules (`client`, `authApi`, `recipeApi`, `pantryApi`, `aiApi`,
plus unused `statsApi`) over 27 same-origin endpoints. `client.ts` adds cookies + CSRF, normalizes
`ApiError`/429 with hardcoded English messages. Contexts do the real state management, with manual
fetch-on-mount and `console.error` failures.

Auth: Django session cookies; login by **username**, signup username/password/optional email, demo
button. No OAuth, reset or remember-me. Port to Supabase email/password (username as profile display
name), `getSession` + `onAuthStateChange`, anonymous sign-in + `seed_demo_data()` for demo, and a
`RequireAuth` decision for pantry/AI routes.

AI UX: suggestions POST, then poll task status every 2 s; the SSE hook exists but is unused. The
polling `finally` clears the loading state immediately (bug) and the interval is never cleared.
Detail page ignores the `model` query param. Rate-limited models are tracked in `sessionStorage` and
auto-fallback is shown in the switcher. LM Studio is a local-only provider and cannot work from a
cloud Edge Function — remove it or document a self-hosted mode.

Shopping list: local optimistic state in `localStorage`, 600 ms debounced `sync` POST, unencrypted.
Exports use WhatsApp/Telegram share URLs, clipboard and `window.print()`; there is no print CSS.
Port to a `shopping_items` table + RLS + optional Realtime, keep exports and dedupe by lowercased
name, and gate remote sync on a session.

i18n: 209 keys per locale, but Turkish is missing `faq.q4/q5`; many core surfaces are hardcoded
English (`CanCookPage`, both detail pages, recipe cards/filter/chat/timer/substitution, pantry and
shopping components, scanner, provider switcher, PWA banner, 429 text). Language storage keys are
inconsistent (`language` vs `whattocook_language_selected`). Unify keys and finish the translations
in the port; do not carry the split.

Images: keyword map + Unsplash fallbacks, local `/media/recipes/*.jpg`, per-name hash fallbacks.
No compression, no EXIF stripping, object URLs are never revoked. Port to Storage, client-side
resize ≤1600 px, revoke URLs, and a public recipe bucket / private scan bucket with retention.

PWA: the manifest exists but the icon is missing and there is **no service worker**; the “Offline
Kitchen Mode” pill is cosmetic. A real PWA (Workbox, icons, offline shell) is net-new work.
CSP currently allows only same-origin, Unsplash and Google Fonts; add the Supabase host (and `wss:`
for Realtime). The 3D landing is ~919 KB lazy `vendor-three`; keep it out of the entry graph and
provide a reduced-motion fallback.

Existing bugs to fix while porting: AI loading state, ignored `model`, ignored `categories` prop,
fake “Ready to Cook” count, recipe ingredient count mismatch, guest sync, language keys, missing
icons, object URL leak, no modal focus traps, no error boundary, dead hooks/components
(`useAIStream`, `usePantryQueries`, `useRecipeQueries`, `statsApi`, `Badge`, `GlassContainer`,
`FadeHtml`, `RecipeMatchCards`). There are no unit tests or lint config in the reference — only
Playwright E2E/CSP/visual suites; add Vitest/ESLint/Prettier in the port.

**Port approach:** keep the TypeScript interfaces and page components; replace the five API modules
and context internals with Supabase (`supabase-js`, PostgREST, `can_cook` RPC, Edge Functions),
preserving response shapes where practical. Extract `scaleQuantity`, image resolution and shopping
formatting into testable shared utilities.

## 11. Ways the port intentionally differs

- NDJSON stream contract with `meta/delta/final/error`, not `{chunk,done}` SSE.
- Reserve/settle metering, per-user and global budgets, kill switch, response cache with explicit
  zero-cost hits.
- Zod schemas + one repair attempt; no silent canned answers. Fallbacks are explicit and observable.
- Canonical ingredient mapping instead of exact Title Case strings.
- Client-side image compression + server-side EXIF stripping; no image retention.
- Real per-user rate limiting keyed on JWT `sub` (plus trusted IP for anonymous/abuse).
- Web and mobile share one gateway client and one stream parser.
- Owner-only RLS everywhere; no `/api/pantries/` collection, no emails in payloads.
- `can_cook()` keeps the exact reference semantics (OR rule, 0% partials, no normalization) but runs
  as one SQL aggregate; any smarter matching is a separately versioned feature.
- Supabase Auth with email/password and anonymous demo sessions, not Django cookies or a shared
  demo password.
- No LM Studio provider in the hosted build: a cloud Edge Function cannot reach a user's localhost.
- A real service worker with an honest offline story, not the reference's cosmetic banner.
- Static-host rewrites and a CSP that includes the Supabase host/WebSocket; no nginx or Docker in the
  deployed path.
- Reference frontend bugs (polling state, ignored `model`, fake match count, split language keys,
  leaked object URLs, missing focus traps) are fixed rather than carried over.
