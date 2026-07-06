import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, cpSync, createReadStream } from 'node:fs';
import { resolve, join, normalize } from 'node:path';

const DATA_DIR = resolve(__dirname, '../data');

/**
 * /data lives at the repo root (single source of truth written by pipeline/).
 * Dev: serve it under `${base}data/*`. Build: copy it into dist/data.
 * Kept as an inline plugin so no extra dependency and no duplicated data dir.
 */
function repoData(): Plugin {
  return {
    name: 'repo-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const m = url.match(/\/data\/(.+\.json)$/);
        if (!m) return next();
        const file = normalize(join(DATA_DIR, m[1]));
        if (!file.startsWith(DATA_DIR) || !existsSync(file)) {
          res.statusCode = 404;
          return res.end('{}');
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(DATA_DIR)) {
        cpSync(DATA_DIR, resolve(__dirname, 'dist/data'), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  // Project pages serve from /<repo>/ — CI sets BASE_PATH=/invented/; local dev stays /
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), repoData()],
  server: {
    fs: { allow: [resolve(__dirname, '..')] },
  },
});
