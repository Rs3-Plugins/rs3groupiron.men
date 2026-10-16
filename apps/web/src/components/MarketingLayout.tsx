import { lazy, Suspense, type ReactNode } from 'react';
// Imported from the module, not the ./Map barrel: the barrel re-exports Rs3Map,
// whose CSS side-effect imports would pull Leaflet back into the eager graph.
import { DEFAULT_CENTER } from './Map/constants';
import { useResolvedTheme, useUiPrefs } from '../hooks/useUiPrefs';
import '../styles/hero.css';

/**
 * Leaflet is ~185 KB and this backdrop is purely decorative, so it must never
 * gate first paint. Its own Suspense with a null fallback lets the page render
 * on the flat `--bg` while the chunk streams in behind it.
 */
const Rs3Map = lazy(() => import('./Map').then((m) => ({ default: m.Rs3Map })));

type MarketingLayoutProps = {
  children: ReactNode;
  /** Rendered in the top-right strip, above the backdrop. */
  topRight?: ReactNode;
  topLeft?: ReactNode;
};

/**
 * Blurred world map, veil and centred content: the shell behind the landing,
 * login, create-group and group-created screens.
 *
 * The shell is pinned to the dark theme whatever the user picked, so the
 * backdrop reads the same for everyone; only the form card inside follows the
 * live theme. That split is the handoff's (`heroVars` vs `formVars`).
 */
export function MarketingLayout({ children, topRight, topLeft }: MarketingLayoutProps) {
  const { prefs } = useUiPrefs();
  const light = useResolvedTheme(prefs.themePref) === 'light';

  return (
    <div className={['hero theme-dark', light ? 'hero--light' : ''].filter(Boolean).join(' ')}>
      <div className="hero-bg" aria-hidden>
        <Suspense fallback={null}>
          <Rs3Map
            className="hero-bg-canvas"
            height="100%"
            x={DEFAULT_CENTER.x}
            y={DEFAULT_CENTER.y}
            zoom={2}
            showIcons
            showLabels={false}
            interactive={false}
          />
        </Suspense>
      </div>
      <div className="hero-veil" />

      {topLeft || topRight ? (
        <div className={topLeft ? 'hero-top hero-top--split' : 'hero-top'}>
          {topLeft}
          {topRight}
        </div>
      ) : null}

      <main className="hero-main">{children}</main>
    </div>
  );
}

/**
 * The theme class for anything that should follow the user's choice rather
 * than the hero's fixed dark. Needed because the shell overrides the tokens
 * `<html>` sets.
 */
export function useFormTheme() {
  const { prefs } = useUiPrefs();
  return useResolvedTheme(prefs.themePref) === 'light' ? 'theme-light' : 'theme-dark';
}
