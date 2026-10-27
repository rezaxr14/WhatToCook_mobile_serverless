-- Gemini 2.5 Flash is no longer available to new API keys ("no longer
-- available to new users"), so route new traffic to the current 3.x models and
-- record their list prices. Prices verified against
-- https://ai.google.dev/gemini-api/docs/pricing on 2026-10-27.
--
-- 3.6 Flash is $0.75 / $3.75 per 1M input/output tokens through 2026-12-31 and
-- $1.50 / $7.50 from 2027-01-01. This row reflects the current period; add a new
-- effective-dated row before the price change instead of editing it.

insert into public.ai_model_prices (
  provider,
  model,
  input_micro_usd_per_million,
  output_micro_usd_per_million,
  active,
  effective_from,
  source_note
)
values
  ('gemini', 'gemini-3.5-flash-lite', 300000, 2500000, true,
   '2026-10-27T00:00:00Z', 'Gemini API list price: $0.30 input / $2.50 output per 1M tokens'),
  ('gemini', 'gemini-3.6-flash', 750000, 3750000, true,
   '2026-10-27T00:00:00Z', 'Gemini API list price through 2026-12-31: $0.75 / $3.75 per 1M tokens'),
  ('gemini', 'gemini-3.8-flash', 750000, 3750000, true,
   '2026-10-27T00:00:00Z', 'Gemini API list price through 2026-12-31: $0.75 / $3.75 per 1M tokens')
on conflict (provider, model, effective_from) do update set
  input_micro_usd_per_million = excluded.input_micro_usd_per_million,
  output_micro_usd_per_million = excluded.output_micro_usd_per_million,
  active = excluded.active,
  source_note = excluded.source_note;

update public.app_config
set model_routing = jsonb_build_object(
  'provider', 'gemini',
  'models', jsonb_build_object(
    'suggestions', 'gemini-3.5-flash-lite',
    'recipe', 'gemini-3.6-flash',
    'chat', 'gemini-3.6-flash',
    'stream', 'gemini-3.6-flash',
    'scan', 'gemini-3.6-flash',
    'substitution', 'gemini-3.5-flash-lite'
  ),
  'fallbacks', jsonb_build_object(
    'text', jsonb_build_array(
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash'
    ),
    'vision', jsonb_build_array(
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite'
    )
  )
)
where id = 1;
