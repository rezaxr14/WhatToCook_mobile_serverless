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
- 12 seeded catalog recipes, 73 canonical ingredients, photos in `media/recipes/`.
- Core AI features: pantry suggestions, full recipe detail, SSE recipe stream, fridge-photo scan,
  recipe chat (which also answers substitutions), Telegram bot.
- There is **no token/cost accounting, no per-user spend quota and no global budget** today.
  Our gateway adds all of that (plan §5.3–5.4).

## 1. AI gateway (reference behavior)

### 1.1 Configuration

From `WhatToCook/settings.py:318–324` and `GetFood/ai_service.py:14–31`:

| Setting | Default | Notes |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini` or `lmstudio` |
| `GEMINI_API_KEY` | empty | never committed |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | verify against live `ListModels` |
| `LMSTUDIO_URL` | `http://host.docker.internal:1234/v1/chat/completions` | local model, non-goal for v1 |
| `MODEL_NAME` | `llama-3.2-3b-instruct` | LM Studio model id |

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
> - 'name': string
> - 'description': mouthwatering 2-3 sentence overview
> - 'cuisine': string (e.g. Italian, Asian, Mexican)
> - 'difficulty': 'Easy' | 'Medium' | 'Hard'
> - 'time_minutes': integer (total cooking time in minutes)
> - 'ingredients': list of objects, each with {'name': string, 'amount': string, 'unit': string}
> - 'instructions': list of objects, each with {'step': string, 'time_minutes': integer or null, 'chef_tip': string or null}
> - 'nutrition': object with {'calories': string, 'protein': string, 'carbs': string, 'fat': string}
> Return ONLY raw JSON, no markdown formatting.

System: `You are a professional chef. Always output valid structured JSON without markdown wrappers.`

**Vision / pantry scan** (`ai_service.py:626–649`; adds a translated `display_name` field for
non-English):

> You are an expert culinary AI and kitchen computer vision assistant. Analyze this image of a
> refrigerator, kitchen pantry, grocery haul, or countertop. Identify all visible food ingredients,
> fresh produce, dairy, meats, seasonings, condiments, and groceries. Return ONLY a clean JSON array
> with objects containing:
> - 'name': standardized singular ingredient name in English Title Case (e.g. 'Egg', 'Tomato', 'Cheddar Cheese', 'Milk', 'Bell Pepper', 'Garlic', 'Chicken Breast', 'Avocado', 'Butter', 'Onion', 'Lemon')
> - 'category': one of ['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Grains & Pasta', 'Pantry & Spices', 'Condiments', 'Bakery', 'Beverage', 'Other']
> - 'confidence': float between 0.0 and 1.0 (estimated confidence of detection)
> - 'estimated_quantity': string or null (e.g. '6 eggs', '2 bottles', '1 bag')
> The 'name' field MUST always be in English regardless of any other language requirement. Return
> ONLY the JSON array, no conversational text or markdown code blocks.

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

Caching: Redis hot layer + `AISuggestionCache` Postgres table, 24 h TTL; keys are hashes of
ingredients/provider/model/language (suggestions) or recipe/provider/model/language (detail).
Only non-degraded answers are cached. Retention 7 days. Task ids cached 15 min.
No idempotency keys for scan/chat/stream; Telegram `update_id` is not deduped.

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

## 6. Ways the port intentionally differs

- NDJSON stream contract with `meta/delta/final/error`, not `{chunk,done}` SSE.
- Reserve/settle metering, per-user and global budgets, kill switch, response cache with explicit
  zero-cost hits.
- Zod schemas + one repair attempt; no silent canned answers. Fallbacks are explicit and observable.
- Canonical ingredient mapping instead of exact Title Case strings.
- Client-side image compression + server-side EXIF stripping; no image retention.
- Real per-user rate limiting keyed on JWT `sub` (plus trusted IP for anonymous/abuse).
- Web and mobile share one gateway client and one stream parser.
