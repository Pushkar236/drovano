import { describe, expect, it } from 'vitest';

import { contrastRatio, isInSrgbGamut } from './color.js';
import { getColor, loadTokens, themeEntries, type ThemeName } from './tokens.js';

/**
 * The Strata contrast contract (DESIGN_SYSTEM.md rule 10: WCAG 2.2 AA is
 * encoded in tokens, not audited later). Changing tokens.json so any pair
 * falls below its floor is a failing build — by design, this test is the
 * merge gate for the palette.
 */
const tokens = loadTokens();

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

interface ContractPair {
  foreground: string;
  background: string;
  floor: number;
}

const CONTRACT: ContractPair[] = [
  // Text on every surface tier.
  { foreground: 'text-primary', background: 'surface-base', floor: AA_TEXT },
  { foreground: 'text-primary', background: 'surface-raised', floor: AA_TEXT },
  { foreground: 'text-primary', background: 'surface-overlay', floor: AA_TEXT },
  { foreground: 'text-primary', background: 'surface-sunken', floor: AA_TEXT },
  { foreground: 'text-secondary', background: 'surface-base', floor: AA_TEXT },
  { foreground: 'text-secondary', background: 'surface-raised', floor: AA_TEXT },
  { foreground: 'text-muted', background: 'surface-base', floor: AA_TEXT },
  // Accent usage: buttons in all interaction states, accent-colored text.
  { foreground: 'text-on-accent', background: 'accent-solid', floor: AA_TEXT },
  { foreground: 'text-on-accent', background: 'accent-hover', floor: AA_TEXT },
  { foreground: 'text-on-accent', background: 'accent-active', floor: AA_TEXT },
  { foreground: 'text-accent', background: 'surface-base', floor: AA_TEXT },
  // Focus ring (WCAG 2.2 focus appearance): ≥3:1 against adjacent surfaces.
  { foreground: 'focus-ring', background: 'surface-base', floor: AA_NON_TEXT },
  { foreground: 'focus-ring', background: 'surface-raised', floor: AA_NON_TEXT },
  // Status text is always readable on the base surface.
  { foreground: 'status-success-text', background: 'surface-base', floor: AA_TEXT },
  { foreground: 'status-warning-text', background: 'surface-base', floor: AA_TEXT },
  { foreground: 'status-danger-text', background: 'surface-base', floor: AA_TEXT },
  { foreground: 'status-info-text', background: 'surface-base', floor: AA_TEXT },
];

for (const theme of ['light', 'dark'] as ThemeName[]) {
  describe(`contrast contract — ${theme} theme`, () => {
    for (const pair of CONTRACT) {
      it(`${pair.foreground} on ${pair.background} ≥ ${String(pair.floor)}:1`, () => {
        const ratio = contrastRatio(
          getColor(tokens, `theme.${theme}.${pair.foreground}`),
          getColor(tokens, `theme.${theme}.${pair.background}`),
        );
        expect(ratio).toBeGreaterThanOrEqual(pair.floor);
      });
    }
  });
}

describe('palette integrity', () => {
  it('every color token is inside the sRGB gamut', () => {
    for (const [path, token] of tokens) {
      if (token.value.kind !== 'color') continue;
      expect(isInSrgbGamut(token.value.color), `${path} is out of sRGB gamut`).toBe(true);
    }
  });

  it('light and dark themes define identical semantic keys', () => {
    const light = [...themeEntries(tokens, 'light').keys()].sort();
    const dark = [...themeEntries(tokens, 'dark').keys()].sort();
    expect(dark).toEqual(light);
    expect(light.length).toBeGreaterThan(0);
  });

  it('the contract covers every text/accent/focus semantic token', () => {
    // New readable-color tokens must be added to the contract explicitly.
    const covered = new Set(CONTRACT.map((pair) => pair.foreground));
    const readable = [...themeEntries(tokens, 'light').keys()].filter(
      (name) =>
        (name.startsWith('text-') || name === 'focus-ring' || name.endsWith('-text')) &&
        name !== 'text-on-accent',
    );
    for (const name of readable) {
      expect(covered.has(name), `semantic token ${name} has no contrast-contract entry`).toBe(true);
    }
  });
});
