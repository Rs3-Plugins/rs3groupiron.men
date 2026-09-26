import { Link } from 'react-router-dom';
import { MarketingLayout } from '../components/MarketingLayout';
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
    <MarketingLayout mainClassName="home-content">
      <h1 className="home-brand">{SITE_NAME}</h1>
      <p className="home-tagline">Track your group. Share the grind.</p>
      <div className="home-actions">
        <Link className="home-btn home-btn--primary" to="/get-started">
          Get started
        </Link>
        <Link className="home-btn" to="/demo">
          Demo
        </Link>
        <Link className="home-btn" to={groupCta.to}>
          {groupCta.label}
        </Link>
      </div>
      <div className="home-social">
        <a
          className="home-btn home-btn--social"
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg className="home-btn-icon" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M20.32 4.37A19.8 19.8 0 0 0 15.89 3c-.2.37-.44.85-.6 1.23a18.27 18.27 0 0 0-5.58 0A12.3 12.3 0 0 0 9.1 3a19.74 19.74 0 0 0-4.44 1.38C2.11 9.14 1.37 13.77 1.74 18.33A19.95 19.95 0 0 0 7 21c.4-.55.76-1.13 1.07-1.74a13 13 0 0 1-1.68-.8c.14-.1.28-.21.41-.32a14.1 14.1 0 0 0 12.4 0c.14.12.28.23.41.32-.54.32-1.1.58-1.69.8.31.61.67 1.19 1.07 1.74a19.9 19.9 0 0 0 5.27-2.67c.44-5.3-.73-9.88-3.13-13.96ZM8.02 15.33c-1.2 0-2.19-1.12-2.19-2.48S6.8 10.38 8.02 10.38s2.21 1.11 2.19 2.47-1 2.48-2.19 2.48Zm7.96 0c-1.2 0-2.19-1.12-2.19-2.48s.98-2.47 2.19-2.47 2.21 1.11 2.19 2.47-1 2.48-2.19 2.48Z"
            />
          </svg>
          Discord
        </a>
        <a
          className="home-btn home-btn--social"
          href={COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg className="home-btn-icon" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M18.5 5H19a1 1 0 0 1 0 2h-.1A3.5 3.5 0 0 1 15.5 10H14v1.5A4.5 4.5 0 0 1 9.5 16h-2A4.5 4.5 0 0 1 3 11.5V5.75C3 5.34 3.34 5 3.75 5H18.5Zm-5 2.5V8h2a1.5 1.5 0 0 0 0-3h-2v2.5ZM5 11.5A2.5 2.5 0 0 0 7.5 14h2A2.5 2.5 0 0 0 12 11.5V7H5v4.5ZM6 18.25c0-.41.34-.75.75-.75h7.5c.41 0 .75.34.75.75s-.34.75-.75.75h-7.5A.75.75 0 0 1 6 18.25Z"
            />
          </svg>
          Buy me a coffee
        </a>
      </div>
    </MarketingLayout>
  );
}
