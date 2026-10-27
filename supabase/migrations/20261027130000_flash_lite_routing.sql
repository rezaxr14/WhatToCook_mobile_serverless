-- Prefer the cheaper, faster Flash-Lite model for every AI feature. Gemini 3.8
-- Flash is currently returning 503 UNAVAILABLE under load, so it is no longer a
-- fallback; 3.6 Flash is the single escalation when Lite fails.
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
    'text', jsonb_build_array('gemini-3.6-flash'),
    'vision', jsonb_build_array('gemini-3.6-flash')
  )
)
where id = 1;
