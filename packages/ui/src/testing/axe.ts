import axe from 'axe-core';

/**
 * Automated accessibility gate for component tests (TESTING.md a11y layer).
 * color-contrast is disabled here because jsdom computes no real styles —
 * color contrast is covered exhaustively by the token contract in
 * @drovano/tokens, and Storybook's addon-a11y checks rendered output.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
      // Landmark containment is a page-composition rule; components render
      // in isolation here. The app shell's E2E a11y pass owns landmarks.
      region: { enabled: false },
    },
  });
  if (results.violations.length > 0) {
    const report = results.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help} → ${violation.nodes.map((n) => n.html).join(' | ')}`,
      )
      .join('\n');
    throw new Error(`axe violations:\n${report}`);
  }
}
