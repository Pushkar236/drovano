import { useEffect, useMemo, useRef, useState } from 'react';

import { filterCommands, type Command, type CommandContext } from './commands.js';

export interface CommandPaletteProps {
  commands: readonly Command[];
  context: CommandContext;
  onClose: () => void;
}

/**
 * The command surface (interaction.md §3). Owned implementation — a
 * combobox + listbox with aria-activedescendant, top-centered on the
 * overlay surface. Focus returns to the invoking element on close
 * (the shell restores it; this component only reports `onClose`).
 */
export function CommandPalette({ commands: all, context, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => filterCommands(all, query), [all, query]);
  const selected = results[Math.min(selectedIndex, results.length - 1)];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const run = (command: Command | undefined): void => {
    if (command === undefined) return;
    onClose();
    command.run(context);
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex((index) =>
          results.length === 0 ? 0 : (index - 1 + results.length) % results.length,
        );
        break;
      case 'Enter':
        event.preventDefault();
        run(selected);
        break;
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[1200]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        className="relative mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border-hairline bg-surface-overlay shadow-overlay"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-results"
          aria-activedescendant={selected === undefined ? undefined : `command-${selected.id}`}
          aria-label="Search commands"
          className="w-full border-b border-border-hairline bg-transparent px-4 py-3 text-md text-text-primary placeholder:text-text-muted focus:outline-none"
          placeholder="Type a command or search…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <ul
          id="command-palette-results"
          role="listbox"
          aria-label="Commands"
          className="max-h-[40vh] overflow-y-auto p-1"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-base text-text-muted" role="presentation">
              No matches — try a different term.
            </li>
          )}
          {results.map((command, index) => (
            <li
              key={command.id}
              id={`command-${command.id}`}
              role="option"
              aria-selected={command.id === selected?.id}
              className={`flex cursor-default items-center justify-between rounded-sm px-3 py-1.5 text-base ${
                command.id === selected?.id
                  ? 'bg-surface-sunken text-text-primary'
                  : 'text-text-secondary'
              }`}
              onMouseEnter={() => {
                setSelectedIndex(index);
              }}
              onClick={() => {
                run(command);
              }}
            >
              <span>{command.name}</span>
              {command.shortcut !== undefined && (
                <kbd className="font-mono text-sm text-text-muted">{command.shortcut}</kbd>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
