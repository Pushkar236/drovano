import { Link, Navigate, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CommandPalette } from './command-palette.js';
import { commands, type CommandContext } from './commands.js';
import { authClient } from './lib/auth-client.js';
import { applyThemePreference } from './theme.js';

/**
 * The three-zone shell (DESIGN_SYSTEM.md §5, interaction.md §6):
 * navigation rail · work canvas · context (peek) panel, plus the global
 * keymap and the command surface. Route content renders into the canvas.
 */
export function Shell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const paletteInvokerRef = useRef<Element | null>(null);

  const commandContext: CommandContext = {
    navigate: (to) => {
      void navigate({ to });
    },
    setTheme: applyThemePreference,
    toggleRail: () => {
      setRailCollapsed((collapsed) => !collapsed);
    },
    togglePeek: () => {
      setPeekOpen((open) => !open);
    },
    signOut: () => {
      void authClient.signOut().then(() => navigate({ to: '/login' }));
    },
  };

  const openPalette = useCallback(() => {
    paletteInvokerRef.current = document.activeElement;
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    if (paletteInvokerRef.current instanceof HTMLElement) {
      paletteInvokerRef.current.focus();
    }
  }, []);

  // Global keymap (interaction.md §2).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      switch (event.key) {
        case 'k':
          event.preventDefault();
          if (paletteOpen) {
            closePalette();
          } else {
            openPalette();
          }
          break;
        case '\\':
          event.preventDefault();
          setRailCollapsed((collapsed) => !collapsed);
          break;
        case '.':
          event.preventDefault();
          setPeekOpen((open) => !open);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [paletteOpen, openPalette, closePalette]);

  // Route changes move focus to the canvas heading (interaction.md §4).
  const previousPathname = useRef(pathname);
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      const heading = document.querySelector<HTMLElement>('main h1');
      heading?.focus();
    }
  }, [pathname]);

  // Session gate (after all hooks): unauthenticated → login.
  if (sessionPending) {
    return <div className="h-dvh" aria-busy="true" />;
  }
  if (session === null) {
    return <Navigate to="/login" />;
  }

  const navLinkClass = (active: boolean): string =>
    `flex min-h-8 items-center gap-2 rounded-md px-2 text-base ${
      active
        ? 'bg-surface-sunken font-medium text-text-primary'
        : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
    }`;

  return (
    <div className="flex h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[1400] focus:m-2 focus:rounded-md focus:bg-surface-overlay focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <nav
        aria-label="Primary"
        data-collapsed={railCollapsed || undefined}
        className={`flex flex-col border-r border-border-hairline bg-surface-base p-2 transition-[width] duration-[var(--duration-base)] ${
          railCollapsed ? 'w-12' : 'w-56'
        }`}
      >
        <div className="flex min-h-8 items-center px-2 font-semibold tracking-tight text-text-primary">
          {railCollapsed ? 'D' : 'Drovano'}
        </div>
        <ul className="mt-2 flex flex-col gap-0.5">
          <li>
            <Link
              to="/"
              className={navLinkClass(pathname === '/')}
              aria-current={pathname === '/' ? 'page' : undefined}
            >
              {railCollapsed ? 'H' : 'Home'}
            </Link>
          </li>
          <li>
            <Link
              to="/workspaces"
              className={navLinkClass(pathname === '/workspaces')}
              aria-current={pathname === '/workspaces' ? 'page' : undefined}
            >
              {railCollapsed ? 'W' : 'Workspaces'}
            </Link>
          </li>
          <li>
            <Link
              to="/settings"
              className={navLinkClass(pathname === '/settings')}
              aria-current={pathname === '/settings' ? 'page' : undefined}
            >
              {railCollapsed ? 'S' : 'Settings'}
            </Link>
          </li>
        </ul>
        <div className="mt-auto flex flex-col gap-1">
          <button
            type="button"
            onClick={openPalette}
            className="flex min-h-8 items-center justify-between rounded-md px-2 text-base text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
          >
            {!railCollapsed && <span>Commands</span>}
            <kbd className="font-mono text-sm text-text-muted">Ctrl K</kbd>
          </button>
          <button
            type="button"
            aria-expanded={!railCollapsed}
            onClick={() => {
              setRailCollapsed((collapsed) => !collapsed);
            }}
            className="flex min-h-8 items-center rounded-md px-2 text-base text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
          >
            {railCollapsed ? '»' : '« Collapse'}
          </button>
        </div>
      </nav>

      <main id="main" className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {peekOpen && (
        <aside
          aria-label="Context panel"
          className="w-80 border-l border-border-hairline bg-surface-base p-4"
        >
          <h2 className="text-md font-semibold text-text-primary">No record selected</h2>
          <p className="mt-1 text-base text-text-secondary">
            Select a record to inspect it here without leaving your view.
          </p>
        </aside>
      )}

      {paletteOpen && (
        <CommandPalette commands={commands} context={commandContext} onClose={closePalette} />
      )}
    </div>
  );
}
