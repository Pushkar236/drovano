/**
 * Theme handling (DESIGN_SYSTEM.md rule 6): dark and light are co-equal;
 * default follows the system. `data-theme` on the root element overrides;
 * its absence means "system" (strata.css handles the media query).
 */
export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'drovano.theme';

export function readThemePreference(storage: Storage = localStorage): ThemePreference {
  const stored = storage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function applyThemePreference(
  preference: ThemePreference,
  storage: Storage = localStorage,
): void {
  if (preference === 'system') {
    delete document.documentElement.dataset.theme;
    storage.removeItem(STORAGE_KEY);
  } else {
    document.documentElement.dataset.theme = preference;
    storage.setItem(STORAGE_KEY, preference);
  }
}

export function initializeTheme(storage: Storage = localStorage): void {
  applyThemePreference(readThemePreference(storage), storage);
}
