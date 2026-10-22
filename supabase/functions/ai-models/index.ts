import { buildAICatalog, readLMStudioStatus, type LMStudioStatus } from '../_shared/ai-catalog.ts';
import { assertAllowedOrigin, checkCors } from '../_shared/cors.ts';
import { createGatewayDeps } from '../_shared/deps.ts';
import { errorResponse, preflight } from '../_shared/gateway.ts';
import { jsonResponse } from '../_shared/http.ts';

const deps = createGatewayDeps();

/**
 * Public catalog endpoint for the client model selector. It never exposes
 * provider secrets: it only reports the deploy-time provider, the local LM
 * Studio state, and the models the client is allowed to request.
 */
Deno.serve(async (request) => {
  const pre = await preflight(request, deps);
  if (pre) return pre;

  let cors = checkCors(request, deps.allowedOrigins()).headers;
  try {
    const config = await deps.loadConfig();
    const allowed = config.allowedOrigins.length > 0 ? config.allowedOrigins : deps.allowedOrigins();
    cors = assertAllowedOrigin(request, allowed);

    let lmStudio: LMStudioStatus = { online: false, models: [] };
    if (config.providerId === 'lmstudio') {
      const env = Deno.env.toObject();
      lmStudio = await readLMStudioStatus(
        env.LMSTUDIO_BASE_URL?.trim() || 'http://127.0.0.1:1234/v1',
        env.LMSTUDIO_API_KEY,
      );
    }

    return jsonResponse(buildAICatalog(config, lmStudio), 200, cors);
  } catch (error) {
    return errorResponse(error, cors);
  }
});
