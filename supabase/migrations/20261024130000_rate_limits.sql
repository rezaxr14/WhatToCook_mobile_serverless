-- M8: per-user and per-IP request rate limits for the AI gateway.
--
-- The existing guards are global (`app_config` daily counters in
-- `reserve_ai_quota` and the provider-wide RPM/RPD env values). Those protect
-- the provider account but let one client burn the entire global budget with a
-- burst. This adds a fixed-window counter per user (stricter for anonymous
-- accounts) and per hashed client IP, checked before quota reservation.
--
-- Fixed windows (default 60 s) are used instead of a true sliding window so the
-- check is a single atomic upsert. The gateway only records client IPs as a
-- SHA-256 hash; raw addresses are never stored.

create table if not exists public.ai_rate_windows (
  subject text not null check (subject in ('user', 'ip')),
  subject_key text not null check (char_length(subject_key) between 1 and 128),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject, subject_key, window_start)
);

create index if not exists ai_rate_windows_start_idx
  on public.ai_rate_windows (window_start);

alter table public.ai_rate_windows enable row level security;

-- No policies: only the service-role gateway and the security-definer function
-- below may touch this table.
revoke all on public.ai_rate_windows from anon, authenticated;

comment on table public.ai_rate_windows is
  'Fixed-window request counters for the AI gateway (per user and hashed client IP). Service role only.';

create or replace function public.check_ai_rate_limit(
  p_user_id uuid,
  p_ip_hash text,
  p_user_limit integer,
  p_ip_limit integer,
  p_window_seconds integer default 60,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_bucket bigint;
  v_retry integer;
  v_hits integer;
  v_allowed boolean := true;
  v_scope text;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_window' using errcode = '22023';
  end if;
  if p_user_limit is not null and p_user_limit < 0 then
    raise exception 'invalid_user_limit' using errcode = '22023';
  end if;
  if p_ip_limit is not null and p_ip_limit < 0 then
    raise exception 'invalid_ip_limit' using errcode = '22023';
  end if;

  -- Align the window to the epoch so every request in the same minute shares a
  -- bucket and retry-after is deterministic.
  v_bucket := floor(extract(epoch from p_now) / p_window_seconds)::bigint;
  v_start := to_timestamp(v_bucket * p_window_seconds);
  v_retry := greatest(
    1,
    ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - p_now)))::integer
  );

  if p_user_id is not null and p_user_limit is not null then
    insert into public.ai_rate_windows as w (subject, subject_key, window_start, hits, updated_at)
    values ('user', p_user_id::text, v_start, 1, p_now)
    on conflict (subject, subject_key, window_start)
    do update set hits = w.hits + 1, updated_at = p_now
    returning hits into v_hits;

    if v_hits > p_user_limit then
      v_allowed := false;
      v_scope := 'user';
    end if;
  end if;

  if p_ip_hash is not null and char_length(p_ip_hash) > 0 and p_ip_limit is not null then
    insert into public.ai_rate_windows as w (subject, subject_key, window_start, hits, updated_at)
    values ('ip', left(p_ip_hash, 128), v_start, 1, p_now)
    on conflict (subject, subject_key, window_start)
    do update set hits = w.hits + 1, updated_at = p_now
    returning hits into v_hits;

    if v_hits > p_ip_limit then
      if v_allowed then
        v_scope := 'ip';
      end if;
      v_allowed := false;
    end if;
  end if;

  -- Old rows are not needed; prune opportunistically so no cron job is required.
  if random() < 0.02 then
    delete from public.ai_rate_windows where window_start < p_now - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'scope', v_scope,
    'retry_after', case when v_allowed then 0 else v_retry end
  );
end;
$$;

revoke all on function public.check_ai_rate_limit(uuid, text, integer, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.check_ai_rate_limit(uuid, text, integer, integer, integer, timestamptz)
  to service_role;

comment on function public.check_ai_rate_limit(uuid, text, integer, integer, integer, timestamptz) is
  'Atomically increments fixed-window request counters and reports whether the user/IP is over its limit.';
