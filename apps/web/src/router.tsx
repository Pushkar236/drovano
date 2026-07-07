import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';

import { HomePage } from './pages/home.js';
import { SettingsPage } from './pages/settings.js';
import { Shell } from './shell.js';

const rootRoute = createRootRoute({
  component: Shell,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
  head: () => ({ meta: [{ title: 'Home · Drovano' }] }),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
  head: () => ({ meta: [{ title: 'Settings · Drovano' }] }),
});

const routeTree = rootRoute.addChildren([homeRoute, settingsRoute]);

/** Router factory: tests pass a memory history; the app uses the browser's. */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    ...(history ? { history } : {}),
    defaultPreload: 'intent',
  });
}

export function createTestRouter(initialPath = '/') {
  return createAppRouter(createMemoryHistory({ initialEntries: [initialPath] }));
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
