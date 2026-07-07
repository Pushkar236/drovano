import { RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { createTestRouter } from './router.js';

async function renderApp(initialPath = '/') {
  const router = createTestRouter(initialPath);
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
  return router;
}

describe('app shell', () => {
  it('renders the three-zone shell with landmarks and the skip link', async () => {
    await renderApp();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('home shows the designed first-run empty state', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { name: 'Welcome to Drovano' })).toBeInTheDocument();
    expect(screen.getByText(/command surface/i)).toBeInTheDocument();
  });

  it('Ctrl+K opens the palette; Enter runs the selected command and navigates', async () => {
    const router = await renderApp();
    await userEvent.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox', { name: 'Search commands' });
    expect(input).toHaveFocus();

    await userEvent.type(input, 'settings');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings');
    });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('Escape closes the palette and restores focus to the invoker', async () => {
    await renderApp();
    const invoker = screen.getByRole('button', { name: /Commands/ });
    await userEvent.click(invoker);
    await screen.findByRole('combobox', { name: 'Search commands' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    expect(invoker).toHaveFocus();
  });

  it('arrow keys move the active option (aria-activedescendant)', async () => {
    await renderApp();
    await userEvent.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox', { name: 'Search commands' });
    const first = input.getAttribute('aria-activedescendant');
    await userEvent.keyboard('{ArrowDown}');
    const second = input.getAttribute('aria-activedescendant');
    expect(second).not.toBe(first);
    await userEvent.keyboard('{ArrowUp}');
    expect(input.getAttribute('aria-activedescendant')).toBe(first);
  });

  it('theme commands set data-theme and persist the preference', async () => {
    await renderApp();
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.type(screen.getByRole('combobox', { name: 'Search commands' }), 'theme: dark');
    await userEvent.keyboard('{Enter}');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('drovano.theme')).toBe('dark');
  });

  it('Ctrl+\\ collapses the rail; Ctrl+. toggles the peek panel', async () => {
    await renderApp();
    const collapse = screen.getByRole('button', { name: /Collapse|»/ });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Control>}\\{/Control}');
    expect(collapse).toHaveAttribute('aria-expanded', 'false');

    expect(screen.queryByRole('complementary', { name: 'Context panel' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Control>}.{/Control}');
    expect(screen.getByRole('complementary', { name: 'Context panel' })).toBeInTheDocument();
    expect(screen.getByText('No record selected')).toBeInTheDocument();
  });

  it('settings page changes and persists the theme via radio group', async () => {
    await renderApp('/settings');
    await userEvent.click(screen.getByRole('radio', { name: /Dark/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('radio', { name: /System/ }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('drovano.theme')).toBeNull();
  });

  it('shell passes axe', async () => {
    await renderApp();
    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
