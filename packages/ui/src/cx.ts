/** Join class names, skipping falsy segments. Local on purpose — no dependency needed. */
export function cx(...segments: (string | false | undefined)[]): string {
  return segments.filter((segment): segment is string => typeof segment === 'string').join(' ');
}
