import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Keep the large Three.js scene in its own lazy chunk. It is only loaded by
// the landing page, never by the catalog/pantry/matcher entry graph.
const THREE_PACKAGES = new Set([
  'three',
  'postprocessing',
  'react-reconciler',
  'its-fine',
  'react-use-measure',
  'three-stdlib',
]);

function manualChunks(id: string): string | undefined {
  // With pnpm the package path is not `node_modules/<pkg>`: it is usually
  // `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>`. Resolve the last
  // `node_modules` segment so vendor splitting also works in this workspace.
  const marker = '/node_modules/';
  const markerIndex = id.lastIndexOf(marker);
  if (markerIndex === -1) return undefined;
  const relative = id.slice(markerIndex + marker.length);
  const pkg = relative.startsWith('@')
    ? relative.split('/').slice(0, 2).join('/')
    : relative.split('/')[0];
  if (!pkg) return undefined;
  if (THREE_PACKAGES.has(pkg) || pkg.startsWith('@react-three/')) return 'vendor-three';
  if (['react', 'react-dom', 'scheduler', 'react-router'].includes(pkg)) return 'vendor-react';
  if (['framer-motion', 'motion-dom', 'motion-utils'].includes(pkg)) return 'vendor-motion';
  if (pkg.includes('i18next')) return 'vendor-i18n';
  if (pkg.startsWith('@tanstack/')) return 'vendor-query';
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: { output: { manualChunks } },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    port: 4173,
  },
});
