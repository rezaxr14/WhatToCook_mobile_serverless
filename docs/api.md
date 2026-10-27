# AI Gateway API

The AI features run as four Supabase Edge Functions behind one shared gateway
module. The web and mobile clients call them directly; there is no custom
server. The wire schemas live in
[`packages/shared/src/ai-contracts.ts`](../packages/shared/src/ai-contracts.ts),
which is the source of truth for request validation, response validation, and
NDJSON events.

| Function               | Feature flag                              | Plan feature     | URL                                  |
| ---------------------- | ----------------------------------------- | ---------------- | ------------------------------------ |
| `generate-recipe`      | `suggestions`, `recipe`, `chat`, `stream` | matching feature | `/functions/v1/generate-recipe`      |
| `scan-pantry`          | `scan`                                    | `scan`           | `/functions/v1/scan-pantry`          |
| `suggest-substitution` | `substitution`                            | `substitution`   | `/functions/v1/suggest-substitution` |
| `ai-models`            | none (metadata only)                      | none             | `/functions/v1/ai-models`            |

The provider (`gemini`, `openrouter`, `lmstudio`, or `fake`) and model are
selected server-side from `app_config.model_routing`, with `AI_PROVIDER`,
`GEMINI_MODEL`, `GEMINI_VISION_MODEL`, `OPENROUTER_MODEL`,
`OPENROUTER_VISION_MODEL`, and `LMSTUDIO_MODEL` / `LMSTUDIO_VISION_MODEL` as
deploy-time overrides. Gemini routes every feature to `gemini-3.5-flash-lite`
with `gemini-3.6-flash` as the only fallback. When `AI_PROVIDER=openrouter`,
`OPENROUTER_MODEL` selects the model for every feature and replaces the Gemini
routing from `app_config.model_routing`; optional OpenRouter fallback model ids
are read from `OPENROUTER_FALLBACK_MODELS` /
`OPENROUTER_VISION_FALLBACK_MODELS`. `AI_FALLBACK_PROVIDER=openrouter` keeps
Gemini primary and retries a failed text/stream/chat call on `OPENROUTER_MODEL`
(staging uses the free `openrouter/free`, billed at $0); pantry photos only
follow the fallback when `AI_FALLBACK_VISION=true`. When
`AI_PROVIDER=lmstudio`, LM Studio's OpenAI-compatible server at
`LMSTUDIO_BASE_URL` (default `http://127.0.0.1:1234/v1`) serves every feature
with `LMSTUDIO_MODEL`; `LMSTUDIO_FALLBACK_MODELS` /
`LMSTUDIO_VISION_FALLBACK_MODELS` may add local fallbacks, and local models are
priced at zero. A client-supplied `provider` is accepted for forward
compatibility but **ignored**. A client-supplied `model` is honored only when it
is in the server allowlist (`OPENROUTER_ALLOWED_MODELS` or
`LMSTUDIO_ALLOWED_MODELS`); for OpenRouter, free models (`openrouter/free` or a
`*:free` id) are always accepted. Otherwise the server-routed model is used.
Free and local models are priced at zero, so they do not consume the monthly
budget.

## Authentication and CORS

Every non-`OPTIONS` request needs a Supabase user access token:

```http
Authorization: Bearer <user-access-token>
Content-Type: application/json
Idempotency-Key: <optional, 8-128 characters>
```

`OPTIONS` preflight is answered without a token. Browser requests must have
their `Origin` in `ALLOWED_ORIGINS`; otherwise the gateway returns
`403 origin_not_allowed`. Native mobile requests do not send `Origin` and are
allowed. `verify_jwt = false` is set for these functions so preflight reaches
the shared layer; `_shared/auth.ts` still rejects every non-preflight request
without a valid token.

Preflight responses allow the headers the browser clients actually send:

```http
Access-Control-Allow-Headers: apikey, authorization, content-type, idempotency-key, x-application-name, x-client-info, x-client-type
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Expose-Headers: retry-after, x-request-id
Access-Control-Max-Age: 86400
Vary: Origin
```

Add any new client header to `ALLOWED_HEADERS` in
`supabase/functions/_shared/cors.ts` and cover it in
`supabase/functions/tests/cors_test.ts`; otherwise the browser drops the
request before it reaches the function.

## Idempotency

`Idempotency-Key` is optional. If supplied, it must be 8-128 characters. A UUID
is used directly; any other value is hashed into a stable UUID for the
`ai_usage_events.request_id` column.

- The first completed request is cached under the key for 24 hours.
- A retry with the same key and same user returns the first response with
  `"duplicate": true`, `"cached": true`, zero usage, and no second charge.
- Use a new key when a different request should be attempted.
- If the response cache has expired but the usage event still exists, the
  gateway returns `409 duplicate_request` rather than charging again.

Normal response caching is separate: the cache key covers feature, provider,
model, locale, and normalized request payload (for scans, the SHA-256 of the
image after metadata stripping). Entries live for 7 days. `force_refresh: true`
skips the read but still writes the new response. A normal cache hit returns
`"cached": true`, `"duplicate": false`, and zero usage. Cache hits do not
consume the daily request allowance.

## `generate-recipe`

One endpoint serves four modes. `mode` is required.

### Suggestions

```json
{
  "mode": "suggestions",
  "ingredients": ["eggs", "tomato", "onion"],
  "locale": "en",
  "dietary": ["vegetarian"],
  "servings": 2,
  "surprise": 1
}
```

Response:

```json
{
  "status": "done",
  "recipes": [
    {
      "name": "Tomato and Egg Skillet",
      "short_description": "A quick, savoury skillet.",
      "cuisine": "Mediterranean",
      "difficulty": "Easy",
      "prep_time": "20 mins",
      "image_hint": "eggs",
      "provider": "gemini",
      "model_used": "gemini-3.5-flash-lite"
    }
  ],
  "model": "gemini-3.5-flash-lite",
  "cached": false,
  "duplicate": false,
  "provider": "gemini",
  "model_used": "gemini-3.5-flash-lite",
  "rate_limited_models": [],
  "usage": { "input_tokens": 123, "output_tokens": 456, "cost_micro_usd": 1180 },
  "remaining": { "plan_id": "free", "daily": {}, "monthly": {}, "resets_at": "..." }
}
```

### Detail

```json
{ "mode": "detail", "recipe_name": "Lemon Pasta", "locale": "en", "servings": 4 }
```

The response is the validated recipe object spread at the top level (`name`,
`description`, `cuisine`, `difficulty`, `time_minutes`, `ingredients`,
`instructions`, optional `nutrition`/`chef_tips`) plus `cached`, `duplicate`,
`provider`, `model_used`, `rate_limited_models`, `usage`, and `remaining`.

### Chat

```json
{
  "mode": "chat",
  "recipe_name": "Lemon Pasta",
  "message": "Can I use olive oil instead of butter?",
  "ingredients": [{ "name": "Pasta", "amount": "200", "unit": "g" }],
  "instructions": ["Boil the pasta."],
  "history": [{ "role": "user", "content": "Hello" }],
  "locale": "en"
}
```

Response fields: `reply`, `recipe_name`, `model_used`, `rate_limited_models`,
plus the common metadata. `ingredients` and `instructions` may be strings,
arrays, or objects; each context value is capped at 12,000 JSON characters.

### Stream

```json
{ "mode": "stream", "recipe_name": "Lemon Pasta", "ingredients": ["pasta", "lemon"] }
```

Response fields: `content`, `recipe_name`, `model_used`,
`rate_limited_models`, plus the common metadata. This mode is for a formatted
recipe; for structured generation use `detail`.

### NDJSON streaming

Set `"stream": true` on any `generate-recipe` mode. The response is
`application/x-ndjson` with one JSON object per line:

```text
{"type":"meta","feature":"chat","cached":false,"remaining":{...},"model":"...","provider":"gemini"}
{"type":"delta","text":"..."}
{"type":"delta","text":"..."}
{"type":"final","data":{...},"usage":{...},"model":"...","provider":"gemini"}
```

`chat` and `stream` modes forward live provider deltas. `suggestions` and
`detail` validate the complete structured output first, then emit it in
chunks; consumers must not assume a delta is independently valid JSON. A
provider or validation failure after the response starts is emitted as:

```text
{"type":"error","code":"provider_error","message":"...","retry_after":null}
```

Preflight, auth, request-validation, quota, and cache-read failures happen
before the stream starts and use the normal JSON error response.

Client cancellation aborts the provider request. If output was already
produced, the gateway settles the partial usage; if settlement itself fails it
refunds. It does not leave a `reserved` event. The client should retain the
`Idempotency-Key` until it has received a terminal `final` or `error`, then
discard it.

## `scan-pantry`

Request:

```json
{
  "image": "<base64 without a data: prefix>",
  "mime_type": "image/jpeg",
  "locale": "en",
  "min_confidence": 0.5,
  "max_items": 25
}
```

`image_base64` is accepted as an alias for `image`. JPEG, PNG, and WebP are
supported; the bytes are checked by magic number and the declared
`mime_type` is not trusted. EXIF/XMP/IPTC metadata is stripped before the
image is sent to the provider. The image is never persisted or cached.

Limits: request body 20 MiB (to accommodate base64 of the 10 MiB Pro image
cap), plan image cap 5 MiB (anonymous/free) or 10 MiB (pro), maximum 30
detected items, `min_confidence` between 0 and 1.

Response:

```json
{
  "status": "done",
  "items": [
    {
      "name": "Eggs",
      "display_name": "Yumurta",
      "category": "Dairy & Eggs",
      "confidence": 0.91,
      "estimated_quantity": "6 eggs",
      "ingredient_id": 1,
      "slug": "eggs",
      "matched": true
    }
  ],
  "detected_count": 5,
  "matched_count": 4,
  "cached": false,
  "duplicate": false,
  "provider": "gemini",
  "model_used": "gemini-3.6-flash",
  "rate_limited_models": [],
  "usage": { "input_tokens": 1234, "output_tokens": 180, "cost_micro_usd": 820 },
  "remaining": { "plan_id": "free", "daily": {}, "monthly": {}, "resets_at": "..." }
}
```

`ingredient_id` is `null` and `matched` is `false` for a detection that is not
in the catalog; the client should let the user confirm or edit it before
saving to the pantry.

## `suggest-substitution`

Request:

```json
{
  "recipe_name": "Lemon Pasta",
  "missing_ingredient": "Butter",
  "available_ingredients": ["Olive oil", "Greek yogurt"],
  "dietary": ["vegetarian"],
  "locale": "en"
}
```

Response:

```json
{
  "status": "done",
  "missing_ingredient": "Butter",
  "substitutes": [
    { "name": "Olive oil", "ratio": "3/4 cup per 1 cup butter", "notes": "Use for sautéing." }
  ],
  "tip": "Add a pinch of salt when using unsalted butter substitutes.",
  "disclaimer": "Check labels for allergens.",
  "cached": false,
  "duplicate": false,
  "provider": "gemini",
  "model_used": "gemini-3.5-flash-lite",
  "rate_limited_models": [],
  "usage": { "input_tokens": 210, "output_tokens": 160, "cost_micro_usd": 85 },
  "remaining": { "plan_id": "free", "daily": {}, "monthly": {}, "resets_at": "..." }
}
```

`recipe_name`, `available_ingredients`, and `dietary` are optional.

## `ai-models`

A public, read-only metadata endpoint for the client model selector. It needs no
bearer token and exposes no provider secrets: it reports the deploy-time
provider, whether a local LM Studio server is reachable, and the models the
client may request. The web client calls it once per session and falls back to
the curated static OpenRouter catalog if the function is not deployed.

Request: `POST /functions/v1/ai-models` (no body).

Response:

```json
{
  "default_provider": "lmstudio",
  "has_gemini": false,
  "gemini_model": "",
  "has_openrouter": false,
  "openrouter_model": "",
  "has_lmstudio": true,
  "lmstudio_online": true,
  "lmstudio_model": "gemma-4-e4b-uncensored-hauhaucs-aggressive",
  "providers": [
    { "id": "lmstudio", "name": "LM Studio", "active": true, "online": true, "badge": "Local AI" }
  ],
  "models": [
    {
      "id": "gemma-4-e4b-uncensored-hauhaucs-aggressive",
      "displayName": "gemma-4-e4b-uncensored-hauhaucs-aggressive",
      "description": "Local model served by LM Studio"
    }
  ],
  "current_model": "gemma-4-e4b-uncensored-hauhaucs-aggressive",
  "is_live": true
}
```

## Errors

Non-stream failures use:

```json
{
  "error": "quota_exceeded",
  "code": "quota_exceeded",
  "message": "Your daily AI request limit has been reached.",
  "details": null,
  "resets_at": "2026-10-23T00:00:00.000Z",
  "retry_after": null
}
```

| Code                   | HTTP | Meaning                                                                 |
| ---------------------- | ---- | ----------------------------------------------------------------------- |
| `unauthorized`         | 401  | Missing, invalid, or expired bearer token.                              |
| `bad_request`          | 400  | Body/schema/type/size validation failed.                                |
| `origin_not_allowed`   | 403  | Browser origin is not in `ALLOWED_ORIGINS`.                             |
| `payload_too_large`    | 413  | Image or JSON body exceeds the limit.                                   |
| `quota_exceeded`       | 429  | Daily feature limit or monthly budget reached.                          |
| `rate_limited`         | 429  | Provider asked us to slow down; see `retry_after`.                      |
| `ai_disabled`          | 503  | Kill switch or feature flag is off.                                     |
| `ai_budget_exhausted`  | 503  | Global daily circuit breaker is open.                                   |
| `provider_error`       | 502  | Provider failed, timed out, or pricing is missing.                      |
| `invalid_model_output` | 502  | Output failed validation after one repair attempt.                      |
| `duplicate_request`    | 409  | Idempotency key already completed and the response is no longer cached. |
| `internal_error`       | 500  | Unexpected gateway/database failure.                                    |

A client disconnect before the response starts may produce HTTP 499 internally;
it is not a normal API response.

## Quota and usage

The gateway calls `reserve_ai_quota`, `settle_ai_usage`, and `refund_ai_usage`
with the service role. Clients cannot call them. `remaining` is the caller's
`get_my_usage()` snapshot after the request:

```json
{
  "plan_id": "free",
  "daily": {
    "suggestions": { "limit": 30, "used": 3, "remaining": 27 }
  },
  "monthly": {
    "budget_micro_usd": 2000000,
    "used_micro_usd": 5400,
    "remaining_micro_usd": 1994600
  },
  "resets_at": "2026-10-23T00:00:00.000Z"
}
```

- A cache hit writes a zero-cost `ai_usage_events` row with `cache_hit=true`;
  it is visible to admins but excluded from daily/monthly quota checks.
- A successful provider call is settled with actual token counts and
  micro-USD cost.
- A provider/validation failure refunds the reservation once.
- A stream cancelled after partial output settles the partial usage instead of
  refunding.
- Optional `AI_RPM_LIMIT` / `AI_RPD_LIMIT` env guards apply globally before a
  reservation. RPM overflow returns `429 rate_limited`; RPD overflow returns
  `429 quota_exceeded` with `resets_at` at the next UTC midnight. Cache hits and
  idempotent replays do not count against either guard.
- Per-client guards run in the same place: `AI_USER_RPM_LIMIT` (default 20/min),
  `AI_ANON_RPM_LIMIT` (default 8/min) and `AI_IP_RPM_LIMIT` (default 40/min per
  hashed client IP). Overflow returns `429 rate_limited` with `Retry-After` at
  the end of the current one-minute window. An env var that is present but blank
  disables that guard; an absent client IP skips the IP guard.
- `AI_PROVIDER=fake` uses deterministic output and zero price; it is the
  supported staging/test configuration.

## Limits summary

| Limit                                                 | Value                                      |
| ----------------------------------------------------- | ------------------------------------------ |
| JSON body (`generate-recipe`, `suggest-substitution`) | 64 KiB                                     |
| Scan body                                             | 20 MiB                                     |
| Image after base64 decode                             | plan cap: 5 MiB free/anonymous, 10 MiB pro |
| Suggestions ingredients                               | 50 items, 60 chars each                    |
| Chat history                                          | 12 messages, 2,000 chars each              |
| Chat message                                          | 4,000 chars                                |
| Chat recipe context                                   | 12,000 JSON chars per value                |
| Scan items returned                                   | 30                                         |
| Substitutes                                           | 6                                          |
| Idempotency key                                       | 8-128 chars                                |
| Idempotency cache TTL                                 | 24 hours                                   |
| Response cache TTL                                    | 7 days                                     |
