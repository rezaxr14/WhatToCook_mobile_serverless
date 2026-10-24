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

export function clientIp(request: Request): string | null {
  for (const header of FORWARDED_HEADERS) {
    const value = request.headers.get(header)?.trim();
    if (!value) continue;
    const candidate = header === 'x-forwarded-for' ? value.split(',')[0]?.trim() : value;
    if (candidate) return candidate;
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
