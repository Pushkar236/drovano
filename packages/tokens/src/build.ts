/**
 * Build entry: tokens.json → dist/strata.css. Run via `pnpm build`
 * (turbo task with dist/** outputs). Consumed by the app shell through
 * Tailwind v4 `@theme` (TASK-0016).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { renderCss } from './css.js';
import { loadTokens } from './tokens.js';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
mkdirSync(distDir, { recursive: true });
const outFile = path.join(distDir, 'strata.css');
writeFileSync(outFile, renderCss(loadTokens()), 'utf8');
process.stdout.write(`tokens: wrote ${outFile}\n`);
