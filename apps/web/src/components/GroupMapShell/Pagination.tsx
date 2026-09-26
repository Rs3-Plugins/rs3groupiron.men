const GAP = '…';

function visiblePages(
  current: number,
  total: number,
  maxButtons: number,
): Array<number | typeof GAP> {
  if (total <= maxButtons) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set([1, total]);
  const windowSize = Math.max(3, maxButtons - 4);
  const end = Math.min(total - 1, Math.max(2, current - Math.floor(windowSize / 2)) + windowSize - 1);
  const start = Math.max(2, end - windowSize + 1);
  for (let i = start; i <= end; i++) pages.add(i);

  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | typeof GAP> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push(GAP);
    out.push(sorted[i]!);
  }
  return out;
}

type PaginationProps = {
  page: number;
  pageCount: number;
  maxButtons: number;
  onSelect: (page: number) => void;
};

export function Pagination({ page, pageCount, maxButtons, onSelect }: PaginationProps) {
  return (
    <div className="gms-items-pages" role="navigation" aria-label="Pages">
      {visiblePages(page, pageCount, maxButtons).map((n, index) =>
        n === GAP ? (
          <span key={`gap-${index}`} className="gms-page-gap">
            {GAP}
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={n === page ? 'gms-page gms-page--active' : 'gms-page'}
            aria-current={n === page ? 'page' : undefined}
            onClick={() => onSelect(n)}
          >
            {n}
          </button>
        ),
      )}
    </div>
  );
}
