import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> normal build in dist/ (what you upload to CrazyGames)
// `npm run build:single` -> one self-contained HTML file (handy for quick sharing/testing)
export default defineConfig(({ mode }) => ({
  base: './', // relative paths: required for CrazyGames / any portal iframe
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
}));
