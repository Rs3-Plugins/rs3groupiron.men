const STATS = [0, 1, 2];
const ACTIONS = [0, 1, 2, 3];

export function PlayerCardSkeleton() {
  return (
    <article className="gms-player gms-player--skeleton" aria-hidden>
      <header className="gms-player-head">
        <span className="skel gms-skel-avatar" />
        <div className="gms-player-meta">
          <span className="skel gms-skel-line gms-skel-line--name" />
          <span className="skel gms-skel-line gms-skel-line--time" />
        </div>
      </header>

      <div className="gms-player-stats">
        {STATS.map((i) => (
          <div key={i} className="gms-stat-row">
            <span className="skel gms-skel-stat-icon" />
            <span className="skel gms-skel-stat" />
          </div>
        ))}
      </div>

      <div className="gms-player-actions">
        {ACTIONS.map((i) => (
          <span key={i} className="skel gms-skel-action" />
        ))}
      </div>
    </article>
  );
}
