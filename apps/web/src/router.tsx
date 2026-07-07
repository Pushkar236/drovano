import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from '@tanstack/react-router';

import { Shell } from './shell.js';

const rootRoute = createRootRoute({});

// Route components lazy-load (code splitting): the initial payload is the
// shell + router; each surface arrives when first visited. The bundle
// budget measures this initial payload via the Vite manifest.
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: lazyRouteComponent(() => import('./pages/login.js'), 'LoginPage'),
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
  component: lazyRouteComponent(() => import('./pages/home.js'), 'HomePage'),
  head: () => ({ meta: [{ title: 'Home · Drovano' }] }),
});

const recordsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/o/$objectKey',
  component: lazyRouteComponent(() => import('./pages/records.js'), 'RecordsPage'),
  head: () => ({ meta: [{ title: 'Records · Drovano' }] }),
});

const pipelinesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/lists',
  component: lazyRouteComponent(() => import('./pages/pipelines.js'), 'PipelinesPage'),
  head: () => ({ meta: [{ title: 'Pipelines · Drovano' }] }),
});

const pipelineBoardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/lists/$listId',
  component: lazyRouteComponent(() => import('./pages/pipeline-board.js'), 'PipelineBoardPage'),
  head: () => ({ meta: [{ title: 'Pipeline · Drovano' }] }),
});

const workspacesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/workspaces',
  component: lazyRouteComponent(() => import('./pages/workspaces.js'), 'WorkspacesPage'),
  head: () => ({ meta: [{ title: 'Workspaces · Drovano' }] }),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('./pages/settings.js'), 'SettingsPage'),
  head: () => ({ meta: [{ title: 'Settings · Drovano' }] }),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    homeRoute,
    recordsRoute,
    pipelinesRoute,
    pipelineBoardRoute,
    workspacesRoute,
    settingsRoute,
  ]),
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
