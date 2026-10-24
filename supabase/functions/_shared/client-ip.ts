/**
 * Client IP extraction and hashing for the AI gateway rate limits.
 *
 * Supabase Edge Functions run behind a proxy that sets `x-forwarded-for` (and
 * usually `x-real-ip`), so the left-most forwarded value is the client. The raw
 * address is hashed immediately: the database only ever stores the digest.
 *
 * IP limiting is best effort. Shared NATs (mobile carriers, offices) share a
 * bucket, which is why the IP limit stays generous while the per-user and
 * per-anonymous-account limits do the tighter work.
 */
const FORWARDED_HEADERS = ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'] as const;

/**
 * Reduce a forwarded value to a bare address. Supabase sends a plain IP today,
 * but a proxy that appends the source port would give every connection its own
 * bucket and silently disable the IP guard, so normalize defensively.
 */
export function normalizeIp(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed?.[1]) return bracketed[1].toLowerCase();
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(value);
  if (v4?.[1]) return v4[1];
  return value.toLowerCase();
}

export function clientIp(request: Request): string | null {
  for (const header of FORWARDED_HEADERS) {
    const value = request.headers.get(header)?.trim();
    if (!value) continue;
    const candidate = header === 'x-forwarded-for' ? value.split(',')[0]?.trim() : value;
    const normalized = candidate ? normalizeIp(candidate) : '';
    if (normalized) return normalized;
  }
  return null;
}

export async function clientIpHash(request: Request): Promise<string | null> {
  const ip = clientIp(request);
  if (!ip) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
