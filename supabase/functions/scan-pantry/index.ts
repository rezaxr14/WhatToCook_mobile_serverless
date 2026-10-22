import { createGatewayDeps } from '../_shared/deps.ts';
import { handleScanPantry } from '../_shared/scan-handler.ts';

const deps = createGatewayDeps();

Deno.serve((request) => handleScanPantry(request, deps));
