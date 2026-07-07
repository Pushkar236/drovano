import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createAppRouter } from './router.js';
import { initializeTheme } from './theme.js';
import './styles/app.css';

initializeTheme();

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('index.html must contain #root');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>,
);
