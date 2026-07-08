import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Routes lazy-load (code splitting): page mounts are async chunks now, and
// CI runners need more than the 1s findBy/waitFor default. The first test
// in a file pays cold-import costs on top, and the web suite shares the
// 2-core CI runner with several Testcontainers suites — 5s flaked on CI,
// then 10s once more container suites landed (2026-07-08). Keep vitest's
// testTimeout above this.
configure({ asyncUtilTimeout: 20_000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

// jsdom gap: TanStack Router calls window.scrollTo on navigation.
window.scrollTo = () => undefined;

// jsdom gaps for the virtualized grid: no ResizeObserver and no layout.
// @tanstack/virtual-core requires a ResizeObserver, so this ACTIVE
// polyfill reports each observed element's (stubbed) rect once — noop
// stubs leave the virtualizer at zero height and zero rendered rows.
const noop = (): void => undefined;
class ResizeObserverPolyfill implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    queueMicrotask(() => {
      const rect = target.getBoundingClientRect();
      const size = [{ inlineSize: rect.width, blockSize: rect.height }];
      this.callback(
        [
          {
            target,
            contentRect: rect,
            borderBoxSize: size,
            contentBoxSize: size,
            devicePixelContentBoxSize: size,
          },
        ],
        this,
      );
    });
  }
  unobserve = noop;
  disconnect = noop;
}
globalThis.ResizeObserver = ResizeObserverPolyfill;

const viewportRect: DOMRect = {
  width: 800,
  height: 600,
  top: 0,
  left: 0,
  bottom: 600,
  right: 800,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};
Element.prototype.getBoundingClientRect = () => viewportRect;
