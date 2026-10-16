import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  readUiPrefs,
  resolvedTheme,
  subscribeUiPrefs,
  writeUiPrefs,
  type ThemePref,
  type UiPrefs,
} from '../lib/uiPrefs';

export function useUiPrefs() {
  const [prefs, setPrefs] = useState<UiPrefs>(readUiPrefs);

  useEffect(() => {
    const unsubscribe = subscribeUiPrefs(setPrefs);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    applyTheme(prefs.themePref);
  }, [prefs.themePref]);

  const setPref = useCallback(<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => {
    writeUiPrefs({ [key]: value } as Partial<UiPrefs>);
  }, []);

  return { prefs, setPref };
}

export function useResolvedTheme(pref: ThemePref): 'light' | 'dark' {
  const [theme, setTheme] = useState(() => resolvedTheme(pref));

  useEffect(() => {
    setTheme(resolvedTheme(pref));
    if (pref !== 'system') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const sync = () => setTheme(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [pref]);

  return theme;
}
