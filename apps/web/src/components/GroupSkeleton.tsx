import { readAppearance } from '../lib/appearance';

const CARDS = [0, 1, 2, 3, 4];
const TABS = [0, 1, 2, 3, 4, 5];

export function GroupSkeleton() {
  return (
    <div
      className="skel-shell"
      data-appearance={readAppearance()}
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading group…</span>

      <div className="skel-chrome" aria-hidden>
        <span className="skel skel-brand" />
        {TABS.map((i) => (
          <span key={i} className="skel skel-tab" />
        ))}
      </div>

      <aside className="skel-side" aria-hidden>
        {CARDS.map((i) => (
          <div key={i} className="skel-card">
            <div className="skel-card-head">
              <span className="skel skel-avatar" />
              <span className="skel skel-line" style={{ width: '55%' }} />
            </div>
            <span className="skel skel-bar" />
            <span className="skel skel-bar" />
            <span className="skel skel-bar" />
          </div>
        ))}
      </aside>

      <main className="skel-panel" aria-hidden>
        <span className="skel skel-panel-head" />
        <span className="skel skel-panel-body" />
      </main>
    </div>
  );
}
