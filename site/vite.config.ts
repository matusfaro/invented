import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, cpSync, createReadStream, realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

const DATA_DIR = resolve(__dirname, '../data');

/**
 * /data lives at the repo root (single source of truth written by pipeline/).
 * Dev: serve it under `${base}data/*`. Build: copy it into dist/data.
 * Kept as an inline plugin so no extra dependency and no duplicated data dir.
 */
function repoData(): Plugin {
  let outputDir = resolve(__dirname, 'dist');
  let building = false;
  return {
    name: 'repo-data',
    configResolved(config) {
      outputDir = resolve(config.root, config.build.outDir);
      building = config.command === 'build';
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const m = url.match(/\/data\/(.+\.json)$/);
        if (!m) return next();
        let file: string;
        try {
          file = realpathSync(resolve(DATA_DIR, decodeURIComponent(m[1])));
          const rel = relative(realpathSync(DATA_DIR), file);
          if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep) || !statSync(file).isFile()) {
            throw new Error('outside data directory');
          }
        } catch {
          res.statusCode = 404;
          return res.end('{}');
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        const stream = createReadStream(file);
        stream.on('error', () => {
          if (!res.headersSent) res.statusCode = 500;
          res.end();
        });
        res.on('close', () => stream.destroy());
        stream.pipe(res);
      });
    },
    closeBundle() {
      if (building && existsSync(DATA_DIR)) {
        cpSync(DATA_DIR, resolve(outputDir, 'data'), { recursive: true });
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
