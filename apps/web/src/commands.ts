/**
 * The command registry behind the ⌘K surface (interaction.md §3).
 * Commands are plain data + a run function; the palette renders and
 * filters them. Modules contribute commands as they land (M2+).
 */
export interface CommandContext {
  navigate: (to: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleRail: () => void;
  togglePeek: () => void;
  signOut: () => void;
}

export interface Command {
  id: string;
  /** Display name; also the filter target. */
  name: string;
  /** Result group per interaction.md §3. */
  group: 'actions' | 'navigation';
  /** Inline shortcut hint (teaching, not binding — bindings live in the shell). */
  shortcut?: string;
  run: (context: CommandContext) => void;
}

export const commands: Command[] = [
  {
    id: 'nav.home',
    name: 'Go to Home',
    group: 'navigation',
    shortcut: 'G H',
    run: (context) => {
      context.navigate('/');
    },
  },
  {
    id: 'nav.workspaces',
    name: 'Go to Workspaces',
    group: 'navigation',
    run: (context) => {
      context.navigate('/workspaces');
    },
  },
  {
    id: 'nav.settings',
    name: 'Go to Settings',
    group: 'navigation',
    run: (context) => {
      context.navigate('/settings');
    },
  },
  {
    id: 'action.sign-out',
    name: 'Sign out',
    group: 'actions',
    run: (context) => {
      context.signOut();
    },
  },
  {
    id: 'action.toggle-rail',
    name: 'Toggle navigation rail',
    group: 'actions',
    shortcut: 'Ctrl \\',
    run: (context) => {
      context.toggleRail();
    },
  },
  {
    id: 'action.toggle-peek',
    name: 'Toggle context panel',
    group: 'actions',
    shortcut: 'Ctrl .',
    run: (context) => {
      context.togglePeek();
    },
  },
  {
    id: 'action.theme-light',
    name: 'Theme: light',
    group: 'actions',
    run: (context) => {
      context.setTheme('light');
    },
  },
  {
    id: 'action.theme-dark',
    name: 'Theme: dark',
    group: 'actions',
    run: (context) => {
      context.setTheme('dark');
    },
  },
  {
    id: 'action.theme-system',
    name: 'Theme: system',
    group: 'actions',
    run: (context) => {
      context.setTheme('system');
    },
  },
];

export function filterCommands(all: readonly Command[], query: string): Command[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...all];
  return all.filter((command) => command.name.toLowerCase().includes(needle));
}
