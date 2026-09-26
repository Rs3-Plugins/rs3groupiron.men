import type { ReactNode } from 'react';
import { DEFAULT_CENTER, Rs3Map } from './Map';
import '../pages/HomePage.css';

type MarketingLayoutProps = {
  /** Extra class on the page root (alongside `home`). */
  className?: string;
  /** Class on the <main> content container. */
  mainClassName?: string;
  children: ReactNode;
};

/** Blurred world-map backdrop + fade + <main>, shared by the marketing pages. */
export function MarketingLayout({ className, mainClassName, children }: MarketingLayoutProps) {
  return (
    <div className={['home', className].filter(Boolean).join(' ')}>
      <div className="home-map" aria-hidden>
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
      </div>
      <div className="home-fade" />
      <main className={mainClassName}>{children}</main>
    </div>
  );
}
