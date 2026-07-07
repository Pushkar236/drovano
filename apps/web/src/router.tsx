import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';

import { HomePage } from './pages/home.js';
import { LoginPage } from './pages/login.js';
import { SettingsPage } from './pages/settings.js';
import { WorkspacesPage } from './pages/workspaces.js';
import { Shell } from './shell.js';

const rootRoute = createRootRoute({});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  head: () => ({ meta: [{ title: 'Sign in · Drovano' }] }),
});

// Everything inside the Shell requires a session (the Shell gates it).
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: Shell,
});

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: HomePage,
  head: () => ({ meta: [{ title: 'Home · Drovano' }] }),
});

const workspacesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/workspaces',
  component: WorkspacesPage,
  head: () => ({ meta: [{ title: 'Workspaces · Drovano' }] }),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
  head: () => ({ meta: [{ title: 'Settings · Drovano' }] }),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([homeRoute, workspacesRoute, settingsRoute]),
]);

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
