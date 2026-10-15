import { Link } from 'react-router-dom';

export function DiscoverLink() {
  return (
    <Link
      className="hero-btn hero-btn--small hero-btn--icon"
      to="/discover"
      title="Discover public groups"
    >
      <CompassIcon />
      Discover
    </Link>
  );
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.9 5.1 8.7 9.3 4.5 11.5 6.7 7.3z" fill="currentColor" />
    </svg>
  );
}
