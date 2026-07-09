import { useState } from 'react';

import { ApiAccessSettings } from '../components/api-access.js';
import { GoogleConnectionsSettings } from '../components/google-connections.js';
import { applyThemePreference, readThemePreference, type ThemePreference } from '../theme.js';

const THEME_OPTIONS: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: 'System', description: 'Follow the operating system preference.' },
  { value: 'light', label: 'Light', description: 'Always light.' },
  { value: 'dark', label: 'Dark', description: 'Always dark.' },
];

export function SettingsPage() {
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference());

  const selectTheme = (next: ThemePreference): void => {
    setTheme(next);
    applyThemePreference(next);
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
        Settings
      </h1>
      <fieldset className="mt-6 rounded-lg border border-border-hairline p-4">
        <legend className="px-1 text-md font-medium text-text-primary">Theme</legend>
        <div className="flex flex-col gap-2">
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-2">
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => {
                  selectTheme(option.value);
                }}
                className="mt-1"
              />
              <span>
                <span className="block text-base text-text-primary">{option.label}</span>
                <span className="block text-sm text-text-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <GoogleConnectionsSettings />
      <ApiAccessSettings />
    </div>
  );
}
