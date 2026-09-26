import { useMemo, useState } from 'react';
import { formatGp, getItemPrices } from '../../lib/itemPrices';
import { formatQty, type GroupItem } from '../../lib/items';
import { ItemIcon } from './ItemIcon';
import { SearchField } from './SearchField';

const PAGE_SIZE_ALL = 8;
const PAGE_SIZE_BANK = 36;
const MAX_PAGE_BUTTONS = 15;
const BAR_COLORS = ['#c47a2c', '#c44b4b', '#4a9e58', '#5a8fd4', '#9b6bc9', '#b8a03a'];

type PriceMode = 'each' | 'stack';

type PricedItem = GroupItem & { stackGe: number; stackAlch: number };

export function ItemsPanel({ items }: { items: GroupItem[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [playerFilter, setPlayerFilter] = useState('all');
  const [sort, setSort] = useState<'qty' | 'name' | 'ge' | 'alch'>('qty');
  const [priceMode, setPriceMode] = useState<PriceMode>('stack');

  const players = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      for (const share of item.shares) names.add(share.player);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) && !String(item.id).includes(q)) {
        return false;
      }
      if (playerFilter !== 'all' && !item.shares.some((s) => s.player === playerFilter)) {
        return false;
      }
      return true;
    });

    if (playerFilter !== 'all') {
      list = list.map((item) => {
        const share = item.shares.find((s) => s.player === playerFilter);
        return {
          ...item,
          quantity: share?.quantity ?? 0,
          shares: share ? [share] : [],
        };
      });
    }

    // Price each item once; the comparator would otherwise re-price per compare.
    const priced: PricedItem[] = list.map((item) => {
      const prices = getItemPrices(item.id);
      return { ...item, stackGe: prices.ge * item.quantity, stackAlch: prices.alch * item.quantity };
    });

    priced.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'ge') return b.stackGe - a.stackGe;
      if (sort === 'alch') return b.stackAlch - a.stackAlch;
      return b.quantity - a.quantity;
    });
    return priced;
  }, [items, query, playerFilter, sort]);

  const totals = useMemo(() => {
    let quantity = 0;
    let ge = 0;
    let alch = 0;
    for (const item of filtered) {
      quantity += item.quantity;
      ge += item.stackGe;
      alch += item.stackAlch;
    }
    return {
      types: filtered.length,
      quantity,
      ge,
      alch,
    };
  }, [filtered]);

  const isSingleBank = playerFilter !== 'all';
  const pageSize = isSingleBank ? PAGE_SIZE_BANK : PAGE_SIZE_ALL;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageButtons = visiblePages(safePage, pageCount, MAX_PAGE_BUTTONS);
  const viewingTitle = bankTitle(playerFilter);

  return (
    <section className="gms-items" aria-label="Group items">
      <div className="gms-items-heading">
        <div className="gms-items-heading-main">
          <h2 className="gms-items-title">{viewingTitle}</h2>
          <div className="gms-items-totals" aria-label="Bank totals">
            <span className="gms-items-stat">
              <em>Items</em>
              <strong>{totals.types.toLocaleString()}</strong>
            </span>
            <span className="gms-items-stat gms-items-stat--qty">
              <img src="/item-prices/qty.png?v=3" alt="" width={16} height={16} />
              <strong>{formatQty(totals.quantity)}</strong>
            </span>
            <span className="gms-items-stat gms-items-stat--ge">
              <img src="/item-prices/ge.png?v=3" alt="" width={16} height={16} />
              <strong>{formatGp(totals.ge)}</strong>
            </span>
            <span className="gms-items-stat gms-items-stat--alch">
              <img src="/item-prices/high-alch.png?v=3" alt="" width={16} height={16} />
              <strong>{formatGp(totals.alch)}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="gms-items-toolbar">
        <SearchField
          className="gms-items-search"
          label="Search items"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />

        <div className="gms-items-pages" role="navigation" aria-label="Pages">
          {pageButtons.map((n, index) =>
            n === '…' ? (
              <span key={`gap-${index}`} className="gms-page-gap">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className={n === safePage ? 'gms-page gms-page--active' : 'gms-page'}
                aria-current={n === safePage ? 'page' : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ),
          )}
        </div>

        <div className="gms-items-price-mode" role="group" aria-label="Price display">
          <button
            type="button"
            className={
              priceMode === 'each'
                ? 'gms-items-mode-btn gms-items-mode-btn--active'
                : 'gms-items-mode-btn'
            }
            onClick={() => setPriceMode('each')}
          >
            Each
          </button>
          <button
            type="button"
            className={
              priceMode === 'stack'
                ? 'gms-items-mode-btn gms-items-mode-btn--active'
                : 'gms-items-mode-btn'
            }
            onClick={() => setPriceMode('stack')}
          >
            × Qty
          </button>
        </div>

        <select
          className="gms-items-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort"
        >
          <option value="qty">Sort: Total Quantity</option>
          <option value="name">Sort: Name</option>
          <option value="ge">Sort: GE value</option>
          <option value="alch">Sort: Alch value</option>
        </select>

        <select
          className="gms-items-select"
          value={playerFilter}
          onChange={(e) => {
            setPlayerFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter player"
        >
          <option value="all">All Players</option>
          {players.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className={isSingleBank ? 'gms-items-tiles' : 'gms-items-grid'}>
        {pageItems.map((item) =>
          isSingleBank ? (
            <ItemTile key={item.id} item={item} priceMode={priceMode} />
          ) : (
            <ItemCard key={item.id} item={item} priceMode={priceMode} />
          ),
        )}
        {pageItems.length === 0 && <p className="gms-items-empty">No items match.</p>}
      </div>
    </section>
  );
}

function bankTitle(playerFilter: string) {
  if (playerFilter === 'all') return 'Viewing: All banks';
  if (playerFilter === 'Shared bank') return 'Viewing: Shared bank';
  return `Viewing: ${playerFilter}'s bank`;
}

function visiblePages(
  current: number,
  total: number,
  maxButtons: number,
): Array<number | '…'> {
  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(total);

  const windowSize = Math.max(3, maxButtons - 4);
  let start = Math.max(2, current - Math.floor(windowSize / 2));
  let end = Math.min(total - 1, start + windowSize - 1);
  start = Math.max(2, end - windowSize + 1);

  for (let i = start; i <= end; i++) pages.add(i);

  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push('…');
    out.push(sorted[i]!);
  }
  return out;
}

function displayPrices(item: GroupItem, priceMode: PriceMode) {
  const { ge, alch } = getItemPrices(item.id);
  const mult = priceMode === 'stack' ? item.quantity : 1;
  return {
    ge: ge * mult,
    alch: alch * mult,
  };
}

function PriceBadge({
  kind,
  value,
  showLabel = false,
  format = 'gp',
}: {
  kind: 'ge' | 'alch' | 'qty';
  value: number;
  showLabel?: boolean;
  format?: 'gp' | 'qty';
}) {
  const meta =
    kind === 'ge'
      ? { label: 'Grand Exchange', src: '/item-prices/ge.png?v=3', text: 'GE' }
      : kind === 'alch'
        ? { label: 'High alchemy', src: '/item-prices/high-alch.png?v=3', text: 'Alch' }
        : { label: 'Quantity', src: '/item-prices/qty.png?v=3', text: 'Qty' };
  return (
    <span
      className={`gms-item-price-badge gms-item-price-badge--${kind}`}
      title={meta.label}
    >
      <img src={meta.src} alt="" width={16} height={16} />
      {showLabel && <em>{meta.text}</em>}
      <strong>{format === 'qty' ? formatQty(value) : formatGp(value)}</strong>
    </span>
  );
}

function ItemTile({ item, priceMode }: { item: GroupItem; priceMode: PriceMode }) {
  const prices = displayPrices(item, priceMode);
  return (
    <article className="gms-item-tile" title={item.name}>
      <ItemIcon itemId={item.id} size={32} />
      <h3 className="gms-item-tile-name">{item.name}</h3>
      <div className="gms-item-tile-prices">
        <PriceBadge kind="qty" value={item.quantity} format="qty" />
        <PriceBadge kind="ge" value={prices.ge} />
        <PriceBadge kind="alch" value={prices.alch} />
      </div>
    </article>
  );
}

function ItemCard({ item, priceMode }: { item: GroupItem; priceMode: PriceMode }) {
  const prices = displayPrices(item, priceMode);
  return (
    <article className="gms-item-card">
      <header className="gms-item-card-head">
        <ItemIcon itemId={item.id} size={32} />
        <h3 className="gms-item-card-name">{item.name}</h3>
        <p className="gms-item-card-qty">Quantity: {formatQty(item.quantity)}</p>
      </header>

      <div className="gms-item-card-prices">
        <PriceBadge kind="ge" value={prices.ge} showLabel />
        <PriceBadge kind="alch" value={prices.alch} showLabel />
      </div>

      <ul className="gms-item-shares">
        {item.shares.map((share, index) => {
          const width = item.quantity
            ? Math.max(6, Math.round((share.quantity / item.quantity) * 100))
            : 0;
          return (
            <li key={share.player}>
              <span className="gms-share-name">{share.player}</span>
              <span className="gms-share-qty">{formatQty(share.quantity)}</span>
              <div className="gms-share-track">
                <div
                  className="gms-share-fill"
                  style={{
                    width: `${width}%`,
                    background: BAR_COLORS[index % BAR_COLORS.length],
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
