# AI Gateway API

The AI features run as Supabase Edge Functions behind one shared gateway
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
| `challenge-nonce`      | none (any signed-in caller)               | none             | `/functions/v1/challenge-nonce`      |
| `verify-challenge`     | none (any signed-in caller)               | none             | `/functions/v1/verify-challenge`     |

The provider (`gemini`, `openrouter`, `lmstudio`, or `fake`) and model are
selected server-side from `app_config.model_routing`, with `AI_PROVIDER`,
`GEMINI_MODEL`, `GEMINI_VISION_MODEL`, `OPENROUTER_MODEL`,
`OPENROUTER_VISION_MODEL`, and `LMSTUDIO_MODEL` / `LMSTUDIO_VISION_MODEL` as
deploy-time overrides. Gemini routes every feature to `gemini-3.5-flash-lite`
with `gemini-3.1-flash-lite` as the only fallback; non-Lite Flash models are
disabled. `ai-models` lists the routed model and its fallbacks. When an
OpenRouter key is available, it also lists exactly one OpenRouter entry: the
deploy-selected `OPENROUTER_MODEL` (staging uses `openrouter/free`), never the
whole free catalog. A request may select a model from that catalog with
`model`.

A client-supplied `provider` is honored when it is enabled for the deployment
(`allowedProviders`); selecting the OpenRouter entry switches the request to
OpenRouter even when Gemini is primary. A namespaced free model id sent without
`provider` (the mobile client only sends `model`) implies OpenRouter. Photo
scans always use the deployment's primary provider (`gemini` in staging)
because the free router does not reliably satisfy the scan schema. A client
`model` is honored only when it is in the server allowlist; free OpenRouter ids
(`openrouter/free` or a `*:free` id) are accepted and priced at $0. Free calls
allow a 60-second non-stream timeout (120 seconds for streams) and structured
free requests get at least 4,096 output tokens, because the router may spend
part of the budget on reasoning. Otherwise the server-routed model is used.

Suggestions and recipe detail responses include an `image` URL for a real dish
photo. The gateway picks a curated photo from the public `recipe-images`
Storage bucket after schema validation and before caching, so clients never
depend on model-provided image URLs. When `AI_PROVIDER=lmstudio`, LM Studio's
OpenAI-compatible server at `LMSTUDIO_BASE_URL` (default
`http://127.0.0.1:1234/v1`) serves every feature with `LMSTUDIO_MODEL`;
`LMSTUDIO_FALLBACK_MODELS` / `LMSTUDIO_VISION_FALLBACK_MODELS` may add local
fallbacks, and local models are priced at zero.

## Authentication and CORS

Every non-`OPTIONS` request needs either a Supabase user access token or the
service key used by main's Django adapter:

```http
Authorization: Bearer <user-access-token>
Content-Type: application/json
Idempotency-Key: <optional, 8-128 characters>
X-Client-Platform: <optional, `android`; defaults to `web`>
```

Service-to-service calls replace the bearer token with:

```http
X-Service-Key: <MAIN_SERVICE_KEY>
Content-Type: application/json
```

`X-Service-Key` is validated before the body is read. The key is compared to
`MAIN_SERVICE_KEY` as SHA-256 digests (constant time) and must be at least 32
characters; an unset or short configured key fails closed with
`401 unauthorized`. A valid service request may then include `principal_class`
(`"anonymous"` or `"registered"`, default `"registered"`) and an optional
`end_user_ref` in the JSON body. Only a short hash of `end_user_ref` is stored.
See [Service principal](#service-principal) below.

`OPTIONS` preflight is answered without a token. Browser requests must have
their `Origin` in `ALLOWED_ORIGINS`; otherwise the gateway returns
`403 origin_not_allowed`. Native mobile requests do not send `Origin` and are
allowed. `verify_jwt = false` is set for these functions so preflight reaches
the shared layer; `_shared/auth.ts` still rejects every non-preflight request
without a valid token or service key.

`X-Client-Platform: android` lets the gateway apply the unattested-device cap
and request Play Integrity instead of Turnstile. It is a hint, not a security
boundary: a browser can send it, but doing so only lowers that caller's
anonymous daily cap and changes which challenge is offered.

Preflight responses allow the headers the browser clients actually send:

```http
Access-Control-Allow-Headers: apikey, authorization, content-type, idempotency-key, x-application-name, x-client-info, x-client-type, x-client-platform
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
      "image": "https://<project>.supabase.co/storage/v1/object/public/recipe-images/dishes/stir_fry.webp",
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
`instructions`, optional `nutrition`/`chef_tips`, and `image`) plus `cached`,
`duplicate`, `provider`, `model_used`, `rate_limited_models`, `usage`, and
`remaining`.

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

The scan always uses the deployment's primary provider, regardless of the
selected text model; in staging that is Gemini Flash-Lite. Clients send the
image as JSON base64 (`image` / `image_base64`), not multipart form data. The
web client also accepts `detected_ingredients` as a display alias for `items`
and adds the returned `ingredient_id` values to the pantry.

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
  "model_used": "gemini-3.5-flash-lite",
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
client may request. Each model includes the `provider` that serves it; clients
switch the request provider when the selected model belongs to another allowed
provider. The web client calls it once per session and falls back to the
curated static OpenRouter catalog if the function is not deployed.

Request: `POST /functions/v1/ai-models` (no body).

Staging (Gemini primary with the single OpenRouter free model):

```json
{
  "default_provider": "gemini",
  "has_gemini": true,
  "gemini_model": "gemini-3.5-flash-lite",
  "has_openrouter": true,
  "openrouter_model": "openrouter/free",
  "has_lmstudio": false,
  "lmstudio_online": false,
  "lmstudio_model": "",
  "providers": [
    {
      "id": "gemini",
      "name": "Google Gemini",
      "active": true,
      "online": true,
      "badge": "Cloud AI"
    },
    { "id": "openrouter", "name": "OpenRouter", "active": true, "online": true, "badge": "Free AI" }
  ],
  "models": [
    {
      "id": "gemini-3.5-flash-lite",
      "displayName": "gemini-3.5-flash-lite",
      "description": "Default Gemini model for every feature",
      "provider": "gemini"
    },
    {
      "id": "gemini-3.1-flash-lite",
      "displayName": "gemini-3.1-flash-lite",
      "description": "Gemini fallback model",
      "provider": "gemini"
    },
    {
      "id": "openrouter/free",
      "displayName": "OpenRouter Free",
      "description": "Free model configured by the server",
      "provider": "openrouter"
    }
  ],
  "current_model": "gemini-3.5-flash-lite",
  "is_live": true
}
```

## Challenge gate

AI calls that would reach a provider are adaptively challenged. Cache hits and
idempotent replays never trigger a challenge, so a repeat of an already-answered
request costs nothing.

1. The gateway calls `consume_ai_challenge(user_id, challenge_every_n_calls)`.
   Every account starts at the threshold, so the first provider-bound call must
   verify. After a verification, the next `challenge_every_n_calls` calls pass.
2. When the counter has reached the threshold, the request fails with
   `403 challenge_required` **before** quota is reserved or charged:

   ```json
   {
     "error": "challenge_required",
     "code": "challenge_required",
     "message": "Verify that you are human to keep using AI.",
     "details": { "kinds": ["turnstile"] },
     "kinds": ["turnstile"]
   }
   ```

   `kinds` is also exposed at the top level for clients that only read `code`.
3. The client verifies through `verify-challenge`; success resets the counter.

Which kind is offered depends on `X-Client-Platform` and
`app_config.challenge_mobile_enforce`:

| Caller                   | `challenge_mobile_enforce` | Kinds                          |
| ------------------------ | -------------------------- | ------------------------------ |
| Web / no platform header | `false` (default)          | `["turnstile"]`                |
| Web / no platform header | `true`                     | `["turnstile", "play_integrity"]` |
| `android`                | `false`                    | skipped (no challenge)         |
| `android`                | `true`                     | `["play_integrity"]`           |

Android never falls back to Turnstile. While mobile enforcement is off, an
Android request that draws from the anonymous pool is capped at
`anonymous_unattested_daily_cap` (default 10) instead of the plan's larger
allowance, so unattested clients cannot drain the demo share. Service calls are
never challenged.

### `challenge-nonce`

`GET /functions/v1/challenge-nonce` (signed-in user; `OPTIONS` allowed) returns a
server-issued, single-use nonce for Play Integrity. The client must not choose
the nonce.

```json
{
  "nonce": "0f1e2d...64 hex characters...",
  "expires_at": "2026-11-03T12:05:00.000Z",
  "platforms": ["turnstile"]
}
```

Nonces are valid for 300 seconds, are deleted on use, and only bind to the
calling user.

### `verify-challenge`

`POST /functions/v1/verify-challenge`

```json
{ "kind": "turnstile", "token": "<turnstile response token>" }
```

```json
{ "kind": "play_integrity", "token": "<integrity token>", "nonce": "<from challenge-nonce>" }
```

Success:

```json
{ "verified": true, "kind": "turnstile", "verified_at": "2026-11-03T12:00:00.000Z" }
```

- Turnstile is checked server-side against Cloudflare `siteverify` using
  `TURNSTILE_SECRET_KEY`, the configured action (default `ai_gate`), and the
  optional `TURNSTILE_ALLOWED_HOSTNAMES` allowlist. Tokens are single use.
- Play Integrity decodes the token with `PLAY_INTEGRITY_SERVICE_ACCOUNT`, checks
  the nonce, package name (`PLAY_INTEGRITY_PACKAGE_NAME`, default
  `com.whattocook.app`), and device/app verdicts. Consuming the nonce is atomic,
  so a replayed token is rejected.
- A failed or expired verification keeps the counter and returns
  `403 challenge_required` with the acceptable `kinds`.
- Missing server configuration fails closed: a missing Turnstile secret or Play
  Integrity service account returns `502 provider_error` and verifies nothing.
  This is the current state until prerequisites H1/H2 are supplied.

## Pools and the provider guard

Provider capacity is split into daily pools so demo traffic cannot starve
signed-in users:

| Pool         | Share of `AI_RPD_LIMIT` | Used by                                             |
| ------------ | ----------------------- | --------------------------------------------------- |
| `anonymous`  | 60 % (`pool_anonymous_pct`) | Anonymous accounts and service calls labelled `anonymous` |
| `registered` | 40 % (`pool_registered_pct`) | Signed-in accounts and unlabelled service calls       |

`AI_RPD_LIMIT` is the provider's real daily limit; the gateway uses 95 % of it as
the hard guard. Pool limits are computed server-side and enforced atomically in
`reserve_ai_quota`. When a pool is full the response is `429 ai_pool_exhausted`
with `details.pool` and `resets_at` at the next UTC midnight:

```json
{
  "error": "ai_pool_exhausted",
  "code": "ai_pool_exhausted",
  "message": "Demo capacity is reached for today. Sign in or try again tomorrow.",
  "details": { "pool": "anonymous" },
  "resets_at": "2026-11-04T00:00:00.000Z"
}
```

In addition, every provider HTTP attempt — primary call, model fallback, and the
schema-repair retry — increments `ai_provider_attempts` before the request is
made. Exceeding the 95 % guard fails with `503 ai_budget_exhausted` and refunds
the reservation, so a retry storm cannot hide behind one reservation.

Per-user daily caps from the plan remain in force on top of the pools:

| Plan        | AI requests (`suggestions`/`recipe`/`chat`/`stream`) | Pantry scans |
| ----------- | ---------------------------------------------------- | ------------ |
| `anonymous` | 20                                                   | 5            |
| `free`      | 60                                                   | 15           |

An unattested Android caller in the anonymous pool is further capped at
`anonymous_unattested_daily_cap` (default 10 AI requests).

## Service principal

Main's Django adapter calls the gateway as the service principal
`main-app-service`. There is deliberately no `auth.users` row: service events
store `service_principal` and a null `user_id`, and a check constraint requires
one of the two. The service principal is created by the gateway, not by data.

Request shape:

```json
{
  "mode": "suggestions",
  "ingredients": ["eggs"],
  "principal_class": "anonymous",
  "end_user_ref": "optional-stable-session-id"
}
```

- `principal_class` selects the pool: `"anonymous"` or `"registered"`
  (default). It cannot grant more capacity than that pool has.
- `end_user_ref` is optional; only an 8-character hash is stored, never the raw
  value.
- Service calls skip the adaptive challenge and per-user plan caps, but they
  still consume the pool and are subject to the global provider guard.
- `Idempotency-Key` works per service principal.
- The service usage snapshot comes from `get_service_usage` and reports
  `plan_id: "service"` with unlimited per-user limits and the month-to-date cost.

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
| `challenge_required`   | 403  | Adaptive verification needed; see top-level `kinds`. No quota charged.  |
| `payload_too_large`    | 413  | Image or JSON body exceeds the limit.                                   |
| `quota_exceeded`       | 429  | Daily feature limit or monthly budget reached.                          |
| `ai_pool_exhausted`    | 429  | The anonymous/registered daily pool is full; see `details.pool`.        |
| `rate_limited`         | 429  | Provider asked us to slow down; see `retry_after`.                      |
| `ai_disabled`          | 503  | Kill switch or feature flag is off.                                     |
| `ai_budget_exhausted`  | 503  | Global daily circuit breaker or 95 % provider guard is exhausted.       |
| `provider_error`       | 502  | Provider failed, timed out, or pricing is missing.                      |
| `invalid_model_output` | 502  | Output failed validation after one repair attempt.                      |
| `duplicate_request`    | 409  | Idempotency key already completed and the response is no longer cached. |
| `internal_error`       | 500  | Unexpected gateway/database failure.                                    |

A client disconnect before the response starts may produce HTTP 499 internally;
it is not a normal API response.

## Quota and usage

The gateway calls `reserve_ai_quota`, `settle_ai_usage`, and `refund_ai_usage`
with the service role. Clients cannot call them. `reserve_ai_quota` takes the
principal (`p_user_id` or `p_service`), the feature, the estimate, the provider
and model, and the optional `p_pool`, `p_pool_limit`, and `p_daily_cap`.
`remaining` is the caller's `get_my_usage()` snapshot after the request (service
callers get `get_service_usage` instead):

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
  it is visible to admins but excluded from daily/monthly quota checks. Cache
  hits also skip the challenge gate and the pool counter.
- A successful provider call is settled with actual token counts and
  micro-USD cost.
- A provider/validation failure refunds the reservation once.
- A challenge failure (`challenge_required`) happens before reservation, so
  there is nothing to refund.
- A stream cancelled after partial output settles the partial usage instead of
  refunding.
- Optional `AI_RPM_LIMIT` / `AI_RPD_LIMIT` env guards apply globally before a
  reservation. RPM overflow returns `429 rate_limited`; RPD overflow returns
  `429 quota_exceeded` with `resets_at` at the next UTC midnight. Cache hits and
  idempotent replays do not count against either guard. `AI_RPD_LIMIT` also
  defines the pool and provider-guard sizes (95 % of it).
- Providers are guarded per attempt, not per reservation: fallbacks and schema
  retries each count, and overflow returns `503 ai_budget_exhausted`.
- Per-client guards run in the same place: `AI_USER_RPM_LIMIT` (default 20/min),
  `AI_ANON_RPM_LIMIT` (default 8/min) and `AI_IP_RPM_LIMIT` (default 40/min per
  hashed client IP). Overflow returns `429 rate_limited` with `Retry-After` at
  the end of the current one-minute window. An env var that is present but blank
  disables that guard; an absent client IP skips the IP guard. Service calls
  skip the per-user and per-IP guards and are metered by pool instead.
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
