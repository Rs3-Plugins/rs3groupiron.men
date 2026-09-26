import { lazy, Suspense, type ReactNode } from 'react';
// Imported from the module, not the ./Map barrel: the barrel re-exports Rs3Map,
// whose CSS side-effect imports would pull Leaflet back into the eager graph.
import { DEFAULT_CENTER } from './Map/constants';
import '../pages/HomePage.css';

/**
 * Leaflet is ~185 KB and this backdrop is purely decorative, so it must never
 * gate first paint. Its own Suspense with a null fallback lets the page render
 * on `.home`'s flat background while the chunk streams in behind it.
 */
const Rs3Map = lazy(() => import('./Map').then((m) => ({ default: m.Rs3Map })));

type MarketingLayoutProps = {
  className?: string;
  mainClassName?: string;
  children: ReactNode;
};

/** Blurred world-map backdrop + fade + <main>, shared by the marketing pages. */
export function MarketingLayout({ className, mainClassName, children }: MarketingLayoutProps) {
  return (
    <div className={['home', className].filter(Boolean).join(' ')}>
      <div className="home-map" aria-hidden>
        <Suspense fallback={null}>
          <Rs3Map
            className="home-map-canvas"
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
      <div className="home-fade" />
      <main className={mainClassName}>{children}</main>
    </div>
  );
}
