import { useResolvedTheme, useUiPrefs } from '../hooks/useUiPrefs';

/**
 * Light/dark switch for the pre-app screens, which have no settings menu.
 *
 * It writes an explicit preference rather than cycling back through "system":
 * someone reaching for this wants the other theme now, not a third state.
 */
export function ThemeToggle() {
  const { prefs, setPref } = useUiPrefs();
  const dark = useResolvedTheme(prefs.themePref) === 'dark';
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      className="hero-btn hero-btn--small"
      aria-label={label}
      title={label}
      onClick={() => setPref('themePref', dark ? 'light' : 'dark')}
    >
      {dark ? '☀ Light' : '☾ Dark'}
    </button>
  );
}
