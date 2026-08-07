import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages serves a project site from https://<user>.github.io/<repo>/, so
 * production asset paths must be prefixed with the repo name. Dev stays at "/".
 * Override with VITE_BASE (e.g. "/" for a <user>.github.io root site).
 */
const PROD_BASE = process.env.VITE_BASE || '/land-master/';

/**
 * Pages has no SPA rewrite rule: a hard refresh on any path other than the
 * index 404s. Shipping a byte-identical 404.html makes Pages serve the app
 * instead, and the client router (if one is ever added) takes over.
 */
function spaFallback() {
  let outDir = 'dist';
  return {
    name: 'land-master:spa-404-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const index = resolve(outDir, 'index.html');
      if (existsSync(index)) copyFileSync(index, resolve(outDir, '404.html'));
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PROD_BASE : '/',
  plugins: [react(), spaFallback()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
}));
