-- Flash-Lite only: keep gemini-3.5-flash-lite as the default for every feature
-- and use gemini-3.1-flash-lite as the single fallback. The non-Lite Flash
-- models (3.6 / 3.8 / 2.5 / 2.0) are deactivated so routing, pricing, and the
-- client model selector can no longer pick them.
--
-- The 3.1 row mirrors the current Flash-Lite list price. Update it if Google
-- publishes a different price for the older generation.

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
  ('gemini', 'gemini-3.1-flash-lite', 300000, 2500000, true,
   '2026-10-27T00:00:00Z', 'Flash-Lite list price: $0.30 input / $2.50 output per 1M tokens')
on conflict (provider, model, effective_from) do update set
  input_micro_usd_per_million = excluded.input_micro_usd_per_million,
  output_micro_usd_per_million = excluded.output_micro_usd_per_million,
  active = excluded.active,
  source_note = excluded.source_note;

update public.ai_model_prices
set active = false
where provider = 'gemini'
  and model in (
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash'
  );

update public.app_config
set model_routing = jsonb_build_object(
  'provider', 'gemini',
  'models', jsonb_build_object(
    'suggestions', 'gemini-3.5-flash-lite',
    'recipe', 'gemini-3.5-flash-lite',
    'chat', 'gemini-3.5-flash-lite',
    'stream', 'gemini-3.5-flash-lite',
    'scan', 'gemini-3.5-flash-lite',
    'substitution', 'gemini-3.5-flash-lite'
  ),
  'fallbacks', jsonb_build_object(
    'text', jsonb_build_array('gemini-3.1-flash-lite'),
    'vision', jsonb_build_array('gemini-3.1-flash-lite')
  )
)
where id = 1;
