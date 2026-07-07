import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { evaluateBudgets, measureAssets, measureInitialAssets } from './check-bundle-size.js';

describe('check-bundle-size', () => {
  let assetsDir: string;

  beforeEach(() => {
    assetsDir = mkdtempSync(path.join(tmpdir(), 'bundle-'));
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(path.join(assetsDir, 'index-abc.js'), 'x'.repeat(10_000));
    writeFileSync(path.join(assetsDir, 'chunk-def.js'), 'y'.repeat(5_000));
    writeFileSync(path.join(assetsDir, 'index-ghi.css'), 'z'.repeat(2_000));
    writeFileSync(path.join(assetsDir, 'favicon.svg'), '<svg/>');
  });

  afterEach(() => {
    rmSync(assetsDir, { recursive: true, force: true });
  });

  it('sums gzip sizes per asset kind, ignoring non-js/css files', () => {
    const totals = measureAssets(assetsDir);
    expect([...totals.keys()].sort()).toEqual(['css', 'js']);
    // Highly compressible fixtures: gzip totals are small but non-zero.
    expect(totals.get('js')).toBeGreaterThan(0);
    expect(totals.get('css')).toBeGreaterThan(0);
  });

  it('flags kinds over budget and passes kinds within budget', () => {
    const totals = new Map([
      ['js', 100_000],
      ['css', 1_000],
    ]);
    const reports = evaluateBudgets(totals, {
      js: { maxGzipBytes: 50_000 },
      css: { maxGzipBytes: 12_288 },
    });
    expect(reports.find((r) => r.kind === 'js')?.withinBudget).toBe(false);
    expect(reports.find((r) => r.kind === 'css')?.withinBudget).toBe(true);
  });

  it('treats a missing kind as zero bytes (within budget)', () => {
    const reports = evaluateBudgets(new Map(), { js: { maxGzipBytes: 1 } });
    expect(reports[0]?.withinBudget).toBe(true);
  });

  it('initial-payload walk: entry + static imports + their css; dynamic chunks excluded', () => {
    const distDir = mkdtempSync(path.join(tmpdir(), 'dist-'));
    mkdirSync(path.join(distDir, 'assets'), { recursive: true });
    writeFileSync(path.join(distDir, 'assets', 'entry.js'), 'e'.repeat(4_000));
    writeFileSync(path.join(distDir, 'assets', 'vendor.js'), 'v'.repeat(4_000));
    writeFileSync(path.join(distDir, 'assets', 'route.js'), 'r'.repeat(100_000));
    writeFileSync(path.join(distDir, 'assets', 'entry.css'), 'c'.repeat(1_000));
    const manifest = {
      'index.html': {
        file: 'assets/entry.js',
        isEntry: true,
        imports: ['_vendor'],
        css: ['assets/entry.css'],
      },
      _vendor: { file: 'assets/vendor.js' },
      'src/pages/records.tsx': { file: 'assets/route.js', imports: ['_vendor'] },
    };
    const totals = measureInitialAssets(distDir, manifest);
    const allJs = measureAssets(path.join(distDir, 'assets')).get('js') ?? 0;
    // Initial js excludes the big dynamic route chunk.
    expect(totals.get('js')).toBeGreaterThan(0);
    expect(totals.get('js') ?? 0).toBeLessThan(allJs);
    expect(totals.get('css')).toBeGreaterThan(0);
    rmSync(distDir, { recursive: true, force: true });
  });
});
