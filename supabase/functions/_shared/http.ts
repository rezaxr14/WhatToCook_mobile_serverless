import { badRequest, payloadTooLarge } from './errors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function requestIdFromIdempotencyKey(
  headerValue: string | null,
  userId: string,
): Promise<string> {
  const raw = headerValue?.trim();
  if (!raw) return crypto.randomUUID();
  if (raw.length < 8 || raw.length > 128) {
    throw badRequest('Idempotency-Key must be between 8 and 128 characters.');
  }
  if (UUID_PATTERN.test(raw)) return raw.toLowerCase();

  // The usage table stores UUIDs. Derive a stable UUID from any client key so
  // repeated requests with the same key map to the same unique row.
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${raw}`)),
  );
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw payloadTooLarge(`Request body is larger than ${formatBytes(maxBytes)}.`);
  }
  if (!request.body) throw badRequest('A request body is required.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw payloadTooLarge(`Request body is larger than ${formatBytes(maxBytes)}.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const bytes = await readBodyWithLimit(request, maxBytes);
  if (bytes.byteLength === 0) throw badRequest('A JSON request body is required.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw badRequest('Request body must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw badRequest('Request body must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

export function decodeBase64(value: string): Uint8Array {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    throw badRequest('The image must be valid base64.');
  }
  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    throw badRequest('The image must be valid base64.');
  }
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: Headers,
  extra?: Record<string, string>,
): Response {
  const output = new Headers(headers);
  output.set('Content-Type', 'application/json; charset=utf-8');
  output.set('Cache-Control', 'no-store');
  if (extra) for (const [key, value] of Object.entries(extra)) output.set(key, value);
  return new Response(JSON.stringify(body), { status, headers: output });
}

export function estimateInputTokens(text: string): number {
  // Rough and deliberately conservative: ~4 characters per token plus a small
  // safety margin for system instructions and JSON wrappers.
  return Math.max(1, Math.ceil(text.length / 4) + 64);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}
