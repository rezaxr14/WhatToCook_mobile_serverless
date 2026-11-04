import { createTelegramLinkDeps } from '../_shared/telegram-link-deps.ts';
import { handleTelegramLink } from '../_shared/telegram-link.ts';

const deps = createTelegramLinkDeps();

Deno.serve((request) => handleTelegramLink(request, deps));
