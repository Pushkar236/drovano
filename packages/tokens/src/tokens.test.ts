import { describe, expect, it } from 'vitest';

import { cssVariableName, renderCss, serializeValue } from './css.js';
import { getColor, loadTokens, parseTokenDocument, TokenDocumentError } from './tokens.js';

describe('parseTokenDocument', () => {
  it('inherits $type from groups and resolves aliases to primitives', () => {
    const tokens = parseTokenDocument({
      color: {
        $type: 'color',
        base: { $value: { colorSpace: 'oklch', components: [0.5, 0.1, 52] } },
        alias: { $value: '{color.base}' },
      },
    });
    const alias = tokens.get('color.alias');
    expect(alias?.aliasOf).toBe('color.base');
    expect(getColor(tokens, 'color.alias')).toEqual({ l: 0.5, c: 0.1, h: 52 });
  });

  it('flattens alias chains to the original primitive', () => {
    const tokens = parseTokenDocument({
      color: {
        $type: 'color',
        base: { $value: { colorSpace: 'oklch', components: [0.5, 0.1, 52] } },
        first: { $value: '{color.base}' },
        second: { $value: '{color.first}' },
      },
    });
    expect(tokens.get('color.second')?.aliasOf).toBe('color.base');
  });

  it('rejects unknown alias targets', () => {
    expect(() =>
      parseTokenDocument({ color: { $type: 'color', broken: { $value: '{color.missing}' } } }),
    ).toThrow(TokenDocumentError);
  });

  it('rejects alias cycles', () => {
    expect(() =>
      parseTokenDocument({
        color: {
          $type: 'color',
          a: { $value: '{color.b}' },
          b: { $value: '{color.a}' },
        },
      }),
    ).toThrow(/cycle/);
  });

  it('rejects tokens without a resolvable $type', () => {
    expect(() => parseTokenDocument({ loose: { $value: 4 } })).toThrow(/\$type/);
  });

  it('rejects cross-type aliases', () => {
    expect(() =>
      parseTokenDocument({
        color: {
          $type: 'color',
          base: { $value: { colorSpace: 'oklch', components: [0.5, 0.1, 52] } },
        },
        space: { $type: 'dimension', bad: { $value: '{color.base}' } },
      }),
    ).toThrow(/type/);
  });
});

describe('css generation', () => {
  const css = renderCss(loadTokens());

  it('emits primitives and semantic var() references in :root', () => {
    expect(css).toContain('--color-neutral-50: oklch(0.985 0.003 255)');
    expect(css).toContain('--color-surface-base: var(--color-neutral-50);');
    expect(css).toContain('--space-4: 1rem;');
    expect(css).toContain('--duration-fast: 120ms;');
    expect(css).toContain('--ease-out: cubic-bezier(0.2, 0, 0, 1);');
  });

  it('remaps only semantics in the dark blocks (both mechanisms)', () => {
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    const darkBlock = css.slice(css.indexOf("[data-theme='dark']"));
    expect(darkBlock).toContain('--color-surface-base: var(--color-neutral-950);');
    expect(darkBlock).not.toContain('--color-neutral-950: oklch');
  });

  it('variable naming follows the scheme', () => {
    expect(cssVariableName('color.neutral.50')).toBe('--color-neutral-50');
    expect(cssVariableName('easing.out')).toBe('--ease-out');
    expect(cssVariableName('font.line-height.base')).toBe('--font-line-height-base');
  });

  it('emits the overlay shadow per theme with its own prefix', () => {
    expect(css).toContain('--shadow-overlay: 0px 2px 8px 0px oklch(0.13 0.004 255 / 0.08),');
    const darkBlock = css.slice(css.indexOf("[data-theme='dark']"));
    expect(darkBlock).toContain('--shadow-overlay: 0px 2px 8px 0px oklch(0 0 0 / 0.35),');
  });

  it('serializes every token kind', () => {
    expect(serializeValue({ kind: 'fontFamily', families: ['Segoe UI', 'sans-serif'] })).toBe(
      "'Segoe UI', sans-serif",
    );
    expect(serializeValue({ kind: 'fontWeight', weight: 600 })).toBe('600');
    expect(serializeValue({ kind: 'number', value: 1300 })).toBe('1300');
    expect(serializeValue({ kind: 'color', color: { l: 0.5, c: 0.1, h: 52, alpha: 0.5 } })).toBe(
      'oklch(0.5 0.1 52 / 0.5)',
    );
  });
});
