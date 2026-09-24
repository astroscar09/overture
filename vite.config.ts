import { defineConfig } from 'vite';

// Minimal config — Vite serves index.html at the project root and bundles
// the ES module graph rooted at src/main.ts.
export default defineConfig({
  server: {
    open: false,
  },
});
