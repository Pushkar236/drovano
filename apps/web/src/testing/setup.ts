import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

// jsdom gap: TanStack Router calls window.scrollTo on navigation.
window.scrollTo = () => undefined;
