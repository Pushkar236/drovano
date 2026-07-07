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
  const assetsDir = path.join(webDir, 'dist', 'assets');
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
  const reports = evaluateBudgets(measureAssets(assetsDir), budgetFile.budgets);

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
