import type { Decorator, Preview } from '@storybook/react-vite';

// Built by @drovano/tokens (`pnpm --filter @drovano/tokens build`); turbo
// runs the build dependency automatically in CI.
import '@drovano/tokens/strata.css';

const withStrataSurface: Decorator = (Story, context) => {
  const theme = context.globals['theme'] === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset['theme'] = theme;
  return (
    <div
      style={{
        background: 'var(--color-surface-base)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-family-sans)',
        padding: 'var(--space-6)',
        minHeight: '100vh',
      }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Strata theme',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [withStrataSurface],
  parameters: {
    a11y: {
      // Fail stories on serious violations (TESTING.md a11y layer).
      test: 'error',
    },
  },
};

export default preview;
