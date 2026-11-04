import { preflightResponse, checkCors } from './cors.ts';
import { errorResponse } from './gateway.ts';
import { jsonResponse } from './http.ts';
import type { AuthContext } from './types.ts';

export interface TelegramLinkStore {
  existingLink(userId: string): Promise<{ chatId: string | null; username: string | null }>;
  issueCode(userId: string, code: string, ttlSeconds: number): Promise<void>;
}

export interface TelegramLinkDeps {
  auth(request: Request): Promise<AuthContext>;
  allowedOrigins(): string[];
  store: TelegramLinkStore;
  botUsername(): string;
  now(): Date;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;
const CODE_TTL_SECONDS = 600;

export async function handleTelegramLink(
  request: Request,
  deps: TelegramLinkDeps,
): Promise<Response> {
  const pre = preflightResponse(request, deps.allowedOrigins());
  if (pre) return pre;

  const cors = checkCors(request, deps.allowedOrigins());
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
      status: 403,
      headers: { ...Object.fromEntries(cors.headers), 'content-type': 'application/json' },
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, cors.headers);
  }

  try {
    const auth = await deps.auth(request);
    const existing = await deps.store.existingLink(auth.userId);
    const bot = deps.botUsername();
    if (existing.chatId) {
      return jsonResponse(
        {
          auth_token: null,
          is_connected: true,
          telegram_username: existing.username,
          bot_username: bot,
          connect_url: `https://t.me/${bot}`,
          direct_tg_url: `tg://resolve?domain=${bot}`,
          web_tg_url: `https://web.telegram.org/a/#?tgaddr=resolve?domain=${bot}`,
        },
        200,
        cors.headers,
      );
    }

    const code = createCode();
    await deps.store.issueCode(auth.userId, code, CODE_TTL_SECONDS);
    return jsonResponse(
      {
        auth_token: code,
        is_connected: false,
        telegram_username: existing.username,
        bot_username: bot,
        connect_url: `https://t.me/${bot}?start=${code}`,
        direct_tg_url: `tg://resolve?domain=${bot}&start=${code}`,
        web_tg_url: `https://web.telegram.org/a/#?tgaddr=resolve?domain=${bot}&start=${code}`,
        expires_at: new Date(deps.now().getTime() + CODE_TTL_SECONDS * 1000).toISOString(),
      },
      200,
      cors.headers,
    );
  } catch (error) {
    return errorResponse(error, cors.headers);
  }
}

export function createCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}
