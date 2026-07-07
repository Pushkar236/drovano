/**
 * Token → CSS custom-property serialization. Semantic tokens are emitted
 * as var() references to their primitive, so the primitive set stays
 * single-sourced in the cascade; dark mode remaps only the semantic tier
 * (DESIGN_SYSTEM.md §4).
 */
import { toCssOklch } from './color.js';
import {
  themeEntries,
  type ResolvedToken,
  type ResolvedTokenValue,
  type ThemeName,
} from './tokens.js';

/** `color.neutral.50` → `--color-neutral-50`; `easing.out` → `--ease-out`. */
export function cssVariableName(path: string): string {
  const renamed = path.startsWith('easing.') ? path.replace('easing.', 'ease.') : path;
  return `--${renamed.replaceAll('.', '-')}`;
}

/**
 * Semantic tokens drop the theme segment: `theme.light.surface-base` →
 * `--color-surface-base`; non-color kinds keep their own prefix from the
 * token name (`shadow-overlay` → `--shadow-overlay`).
 */
export function semanticVariableName(name: string, kind: ResolvedTokenValue['kind']): string {
  return kind === 'color' ? `--color-${name}` : `--${name}`;
}

export function serializeValue(value: ResolvedTokenValue): string {
  switch (value.kind) {
    case 'color':
      return toCssOklch(value.color, value.color.alpha);
    case 'dimension':
      return `${String(value.dimension.value)}${value.dimension.unit}`;
    case 'duration':
      return `${String(value.duration.value)}${value.duration.unit}`;
    case 'cubicBezier':
      return `cubic-bezier(${value.points.join(', ')})`;
    case 'fontFamily':
      return value.families.map((f) => (f.includes(' ') ? `'${f}'` : f)).join(', ');
    case 'fontWeight':
      return String(value.weight);
    case 'number':
      return String(value.value);
    case 'shadow':
      return value.layers
        .map((layer) =>
          [
            serializeValue({ kind: 'dimension', dimension: layer.offsetX }),
            serializeValue({ kind: 'dimension', dimension: layer.offsetY }),
            serializeValue({ kind: 'dimension', dimension: layer.blur }),
            serializeValue({ kind: 'dimension', dimension: layer.spread }),
            toCssOklch(layer.color, layer.color.alpha),
          ].join(' '),
        )
        .join(', ');
  }
}

function themeBlockBody(tokens: Map<string, ResolvedToken>, theme: ThemeName): string[] {
  const lines: string[] = [];
  for (const [name, token] of themeEntries(tokens, theme)) {
    const reference =
      token.aliasOf !== undefined
        ? `var(${cssVariableName(token.aliasOf)})`
        : serializeValue(token.value);
    lines.push(`  ${semanticVariableName(name, token.value.kind)}: ${reference};`);
  }
  return lines;
}

/** Render the complete strata.css text from a resolved token map. */
export function renderCss(tokens: Map<string, ResolvedToken>): string {
  const light = themeEntries(tokens, 'light');
  const dark = themeEntries(tokens, 'dark');
  const lightKeys = [...light.keys()].sort();
  const darkKeys = [...dark.keys()].sort();
  if (lightKeys.join(',') !== darkKeys.join(',')) {
    const onlyLight = lightKeys.filter((k) => !dark.has(k));
    const onlyDark = darkKeys.filter((k) => !light.has(k));
    throw new Error(
      `theme parity violation — light-only: [${onlyLight.join(', ')}], dark-only: [${onlyDark.join(', ')}]`,
    );
  }

  const primitiveLines: string[] = [];
  for (const [path, token] of tokens) {
    if (path.startsWith('theme.')) continue;
    primitiveLines.push(`  ${cssVariableName(path)}: ${serializeValue(token.value)};`);
  }

  const lightLines = themeBlockBody(tokens, 'light');
  const darkLines = themeBlockBody(tokens, 'dark');

  return [
    '/* Strata design tokens — GENERATED from tokens.json by @drovano/tokens. Do not edit. */',
    '/* Themes: explicit via [data-theme], otherwise follows the system preference. */',
    ':root {',
    ...primitiveLines,
    ...lightLines,
    '}',
    "[data-theme='dark'] {",
    ...darkLines,
    '}',
    '@media (prefers-color-scheme: dark) {',
    "  :root:not([data-theme='light']) {",
    ...darkLines.map((line) => `  ${line}`),
    '  }',
    '}',
    '',
  ].join('\n');
}
