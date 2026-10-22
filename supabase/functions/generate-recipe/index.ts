import { createGatewayDeps } from '../_shared/deps.ts';
import { handleGenerateRecipe } from '../_shared/generate-handler.ts';

const deps = createGatewayDeps();

Deno.serve((request) => handleGenerateRecipe(request, deps));
