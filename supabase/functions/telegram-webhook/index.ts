import { createTelegramDeps } from '../_shared/telegram-deps.ts';
import { handleTelegramWebhook } from '../_shared/telegram.ts';

const deps = createTelegramDeps();

Deno.serve((request) => handleTelegramWebhook(request, deps));
