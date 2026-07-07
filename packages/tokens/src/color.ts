/**
 * OKLCH color math for the token pipeline: gamut checks and the WCAG 2.x
 * contrast contract run on these functions in CI (DESIGN_SYSTEM.md rule 10:
 * AA is encoded in tokens, not audited later).
 *
 * Conversion per the OKLab reference (Björn Ottosson) — OKLab → LMS →
 * linear sRGB. WCAG relative luminance is computed on the linear values.
 */

export interface Oklch {
  /** Lightness 0–1 */
  l: number;
  /** Chroma ≥ 0 */
  c: number;
  /** Hue in degrees */
  h: number;
}

export function oklchToLinearSrgb({ l: L, c: C, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Slight epsilon: values that clip imperceptibly still count as in gamut. */
const GAMUT_EPSILON = 0.0005;

export function isInSrgbGamut(color: Oklch): boolean {
  return oklchToLinearSrgb(color).every(
    (channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON,
  );
}

export function relativeLuminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(color);
  const clamp = (channel: number): number => Math.min(1, Math.max(0, channel));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const lf = relativeLuminance(foreground);
  const lb = relativeLuminance(background);
  const [lighter, darker] = lf > lb ? [lf, lb] : [lb, lf];
  return (lighter + 0.05) / (darker + 0.05);
}

/** CSS serialization used by the builder. */
export function toCssOklch({ l, c, h }: Oklch, alpha?: number): string {
  const base = `oklch(${String(l)} ${String(c)} ${String(h)}`;
  return alpha !== undefined && alpha < 1 ? `${base} / ${String(alpha)})` : `${base})`;
}
