import type { AppearanceTheme } from '../api/groupClient';

const STORAGE_KEY = 'rs3-ui-appearance-v1';

export const DEFAULT_APPEARANCE: AppearanceTheme = 'rs3';

export function readAppearance(): AppearanceTheme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'modern' ? 'modern' : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function writeAppearance(theme: AppearanceTheme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
  }
}
