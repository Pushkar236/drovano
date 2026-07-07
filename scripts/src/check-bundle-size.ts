/**
 * check-bundle-size — enforce gzip budgets on the web app's production
 * bundle (TASK-0018 part 1; TESTING.md performance checks). Run after
 * `turbo build`. Exit 0 within budget, 1 over budget or missing build,
 * 2 usage error.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

interface Budget {
  maxGzipBytes: number;
  note?: string;
}

export interface BundleReport {
  kind: string;
  gzipBytes: number;
  maxGzipBytes: number;
  withinBudget: boolean;
}

export function measureAssets(assetsDir: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const file of readdirSync(assetsDir)) {
    const extension = path.extname(file).slice(1);
    if (extension !== 'js' && extension !== 'css') continue;
    const gzipped = gzipSync(readFileSync(path.join(assetsDir, file))).byteLength;
    totals.set(extension, (totals.get(extension) ?? 0) + gzipped);
  }
  return totals;
}

interface ManifestChunk {
  file: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
}

/**
 * Measure the INITIAL payload — the entry chunk plus its static-import
 * closure and their css — from Vite's manifest. Route chunks behind
 * dynamic imports are excluded: the budget guards first load (PRD §5),
 * not the sum of every lazily-loaded surface.
 */
export function measureInitialAssets(
  distDir: string,
  manifest: Record<string, ManifestChunk>,
): Map<string, number> {
  const totals = new Map<string, number>();
  const gzipOf = (file: string): number =>
    gzipSync(readFileSync(path.join(distDir, file))).byteLength;

  const seenChunks = new Set<string>();
  const seenFiles = new Set<string>();
  const visit = (key: string): void => {
    if (seenChunks.has(key)) return;
    seenChunks.add(key);
    const chunk = manifest[key];
    if (chunk === undefined) return;
    if (!seenFiles.has(chunk.file)) {
      seenFiles.add(chunk.file);
      totals.set('js', (totals.get('js') ?? 0) + gzipOf(chunk.file));
    }
    for (const cssFile of chunk.css ?? []) {
      if (seenFiles.has(cssFile)) continue;
      seenFiles.add(cssFile);
      totals.set('css', (totals.get('css') ?? 0) + gzipOf(cssFile));
    }
    for (const dependency of chunk.imports ?? []) visit(dependency);
  };

  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.isEntry === true) visit(key);
  }
  return totals;
}

export function evaluateBudgets(
  totals: Map<string, number>,
  budgets: Record<string, Budget>,
): BundleReport[] {
  return Object.entries(budgets).map(([kind, budget]) => {
    const gzipBytes = totals.get(kind) ?? 0;
    return {
      kind,
      gzipBytes,
      maxGzipBytes: budget.maxGzipBytes,
      withinBudget: gzipBytes <= budget.maxGzipBytes,
    };
  });
}

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      [
        'check-bundle-size — gzip budgets for apps/web production output',
        '',
        'Usage: pnpm check-bundle [--help]',
        'Budgets: apps/web/bundle-budget.json. Requires a prior build',
        '(pnpm turbo run build). Exit codes: 0 ok · 1 over/missing · 2 usage',
      ].join('\n'),
    );
    return;
  }
  if (args.length > 0) {
    console.error(`Unknown arguments: ${args.join(' ')} (try --help)`);
    process.exitCode = 2;
    return;
  }

  const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const webDir = path.join(root, 'apps', 'web');
  const distDir = path.join(webDir, 'dist');
  const assetsDir = path.join(distDir, 'assets');
  if (!existsSync(assetsDir)) {
    console.error(
      'check-bundle-size: apps/web/dist/assets not found — run `pnpm turbo run build` first.',
    );
    process.exitCode = 1;
    return;
  }

  const budgetFile = JSON.parse(readFileSync(path.join(webDir, 'bundle-budget.json'), 'utf8')) as {
    budgets: Record<string, Budget>;
  };
  const manifestPath = path.join(distDir, '.vite', 'manifest.json');
  let totals: Map<string, number>;
  if (existsSync(manifestPath)) {
    totals = measureInitialAssets(
      distDir,
      JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ManifestChunk>,
    );
    console.log('  (measuring initial payload from the Vite manifest; route chunks lazy-load)');
  } else {
    totals = measureAssets(assetsDir);
  }
  const reports = evaluateBudgets(totals, budgetFile.budgets);

  let failed = false;
  for (const report of reports) {
    const status = report.withinBudget ? 'ok' : 'OVER BUDGET';
    console.log(
      `  ${report.kind}: ${formatKiB(report.gzipBytes)} / ${formatKiB(report.maxGzipBytes)} — ${status}`,
    );
    if (!report.withinBudget) failed = true;
  }
  if (failed) {
    console.error(
      'check-bundle-size: budget exceeded. Split routes/dependencies or raise the budget via a reviewed change to bundle-budget.json.',
    );
    process.exitCode = 1;
    return;
  }
  console.log('check-bundle-size: within budget.');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
