import { createGatewayDeps } from '../_shared/deps.ts';
import { handleVerifyChallenge } from '../_shared/challenge-handlers.ts';

const deps = createGatewayDeps();

Deno.serve((request) => handleVerifyChallenge(request, deps));
