import { Link } from 'react-router-dom';
import { DiscoverLink } from '../components/DiscoverLink';
import { MarketingLayout } from '../components/MarketingLayout';
import { ThemeToggle } from '../components/ThemeToggle';
import { COFFEE_URL, DISCORD_URL, SITE_NAME } from '../lib/constants';
import { readGroupSession } from '../lib/groupSession';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function HomePage() {
  useDocumentTitle(null, { canonicalPath: '/' });
  const hasSession = readGroupSession() != null;
  const groupCta = hasSession
    ? { to: '/group', label: 'Go to group' }
    : { to: '/login', label: 'Login' };

  return (
    <MarketingLayout
      topRight={
        <>
          <DiscoverLink />
          <ThemeToggle />
        </>
      }
    >
      <div className="hero-hello hero-stagger">
        <img className="hero-logo" src="/logo-512.png" alt="" width={150} height={150} />

        <span className="hero-kicker">RUNESCAPE 3</span>

        {/* The wordmark is drawn, the heading is read: one h1, visually hidden. */}
        <span className="hero-wordmark" aria-hidden>
          Group <em>Ironman</em>
        </span>
        <h1 className="hero-h1">{SITE_NAME}</h1>

        <div className="hero-rule" aria-hidden />

        <p className="hero-tagline">Track your group. Share the grind.</p>

        <div className="hero-actions">
          <Link className="hero-btn hero-btn--primary" to="/get-started">
            Get started
          </Link>
          <Link className="hero-btn" to="/demo">
            Demo
          </Link>
          <Link className="hero-btn" to={groupCta.to}>
            {groupCta.label}
          </Link>
        </div>

        <div className="hero-links">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
            Discord ↗
          </a>
          <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
            Buy me a coffee ↗
          </a>
        </div>
      </div>
    </MarketingLayout>
  );
}
