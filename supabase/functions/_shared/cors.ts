import { originNotAllowed } from './errors.ts';

const ALLOWED_HEADERS = 'authorization, content-type, idempotency-key, x-client-type';
const ALLOWED_METHODS = 'POST, OPTIONS';
const EXPOSED_HEADERS = 'retry-after, x-request-id';

export interface CorsResult {
  allowed: boolean;
  origin: string | null;
  headers: Headers;
}

export function parseAllowedOrigins(value: string | undefined | null): string[] {
  if (!value) return [];
  // Accept commas and whitespace. The CLI can turn an unquoted comma-separated
  // argument into a space-separated value in PowerShell.
  return value
    .split(/[\s,]+/)
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function checkCors(request: Request, allowedOrigins: string[]): CorsResult {
  const originHeader = request.headers.get('origin');
  const headers = new Headers({
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });

  if (!originHeader) {
    // Native mobile clients do not send Origin. No CORS headers are needed.
    return { allowed: true, origin: null, headers };
  }

  const origin = originHeader.replace(/\/$/, '');
  const allowAll = allowedOrigins.includes('*');
  const allowed = allowAll || allowedOrigins.includes(origin);
  if (allowed) {
    headers.set('Access-Control-Allow-Origin', allowAll ? '*' : origin);
  }
  return { allowed, origin, headers };
}

export function preflightResponse(request: Request, allowedOrigins: string[]): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const cors = checkCors(request, allowedOrigins);
  if (!cors.allowed) {
    return new Response(null, { status: 403, headers: cors.headers });
  }
  return new Response(null, { status: 204, headers: cors.headers });
}

export function assertAllowedOrigin(request: Request, allowedOrigins: string[]): Headers {
  const cors = checkCors(request, allowedOrigins);
  if (!cors.allowed) {
    throw originNotAllowed(cors.origin ?? 'null');
  }
  return cors.headers;
}

export function withCors(headers: Headers, corsHeaders: Headers): Headers {
  corsHeaders.forEach((value, key) => headers.set(key, value));
  return headers;
}
