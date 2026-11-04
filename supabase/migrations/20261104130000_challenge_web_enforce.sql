-- Plan prerequisite H1 (Cloudflare Turnstile keys) is not available yet, so the
-- web challenge needs the same reversible switch Android already has. It stays
-- on by default: turn it off only while the keys are missing, and back on the
-- moment `TURNSTILE_SECRET_KEY` is configured.
alter table public.app_config
  add column if not exists challenge_web_enforce boolean not null default true;

comment on column public.app_config.challenge_web_enforce is
  'Enforce the Turnstile challenge for web callers. Default true; disable only while plan prerequisite H1 (Turnstile keys) is missing.';
