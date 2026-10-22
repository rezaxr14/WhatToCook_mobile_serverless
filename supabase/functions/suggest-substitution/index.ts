import { createGatewayDeps } from '../_shared/deps.ts';
import { handleSuggestSubstitution } from '../_shared/substitution-handler.ts';

const deps = createGatewayDeps();

Deno.serve((request) => handleSuggestSubstitution(request, deps));
