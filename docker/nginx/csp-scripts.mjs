// Hashes SHA-256 de los <script> en línea del index.html compilado, para la CSP de nginx (T802).
// Lo corre frontend/Dockerfile después de `vite build`: si el script del tema cambia, el hash se
// recalcula solo. Uso: node docker/nginx/csp-scripts.mjs frontend/dist/index.html
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const html = readFileSync(process.argv[2], 'utf8');
const enLinea = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

const hashes = [...html.matchAll(enLinea)].map(
  ([, codigo]) => `'sha256-${createHash('sha256').update(codigo, 'utf8').digest('base64')}'`,
);
process.stdout.write(hashes.join(' '));
