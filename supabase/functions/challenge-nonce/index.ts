import { createGatewayDeps } from '../_shared/deps.ts';
import { handleChallengeNonce } from '../_shared/challenge-handlers.ts';

const deps = createGatewayDeps();

Deno.serve((request) => handleChallengeNonce(request, deps));
