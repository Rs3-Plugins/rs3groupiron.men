import type { ReactNode } from 'react';

export function PanelToolbar({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="gms-panel-toolbar">
      <h2 className="gms-panel-title">{title}</h2>
      {children}
    </div>
  );
}

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

export function PanelRowsSkeleton({ rows = SKELETON_ROWS.length }: { rows?: number }) {
  return (
    <div className="gms-panel-skeleton" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {SKELETON_ROWS.slice(0, rows).map((i) => (
        <span key={i} className="skel gms-panel-skeleton-row" aria-hidden />
      ))}
    </div>
  );
}

type PanelStatusProps = {
  error?: string | null;
  loading?: boolean;
  refreshing?: boolean;
  empty?: boolean;
  emptyText?: ReactNode;
};

export function PanelStatus({
  error,
  loading = false,
  refreshing = false,
  empty = false,
  emptyText,
}: PanelStatusProps) {
  if (error) {
    return <p className="gms-panel-status gms-panel-status--error">{error}</p>;
  }
  if (loading) return <PanelRowsSkeleton />;
  return (
    <>
      {refreshing && (
        <p className="gms-panel-status" aria-live="polite">
          Refreshing…
        </p>
      )}
      {empty && <p className="gms-panel-status">{emptyText}</p>}
    </>
  );
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error';
  children: ReactNode;
}) {
  const error = tone === 'error';
  return (
    <p
      className={error ? 'gms-settings-banner gms-settings-banner--error' : 'gms-settings-banner'}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

export function LoadMoreButton({
  loading,
  disabled = false,
  onClick,
}: {
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="gms-panel-more"
      disabled={loading || disabled}
      onClick={onClick}
    >
      {loading ? 'Loading…' : 'Load more'}
    </button>
  );
}
