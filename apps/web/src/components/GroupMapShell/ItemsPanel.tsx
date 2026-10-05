import { useMemo } from 'react';
import { useUrlNumber, useUrlState, useUrlText } from '../../hooks/useUrlState';
import { formatGp, getItemPrices } from '../../lib/itemPrices';
import { formatQty, type GroupItem } from '../../lib/items';
import { IconSelect } from './IconSelect';
import { ItemIcon } from './ItemIcon';
import { memberOptions, type MemberBadge } from './memberOptions';
import { Pagination } from './Pagination';
import { SearchField } from './SearchField';

const PAGE_SIZE_ALL = 8;
const PAGE_SIZE_BANK = 36;
const MAX_PAGE_BUTTONS = 15;
const BAR_COLORS = ['#c47a2c', '#c44b4b', '#4a9e58', '#5a8fd4', '#9b6bc9', '#b8a03a'];

type PriceMode = 'each' | 'stack';
type Sort = 'qty' | 'name' | 'ge' | 'alch';
type PricedItem = GroupItem & { stackGe: number; stackAlch: number };

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'qty', label: 'Sort: Total Quantity' },
  { value: 'name', label: 'Sort: Name' },
  { value: 'ge', label: 'Sort: GE value' },
  { value: 'alch', label: 'Sort: Alch value' },
];

const SORT_VALUES: Sort[] = SORTS.map((s) => s.value);
const PRICE_MODES: PriceMode[] = ['each', 'stack'];

const BADGES = {
  ge: { label: 'Grand Exchange', src: '/item-prices/ge.png?v=3', text: 'GE' },
  alch: { label: 'High alchemy', src: '/item-prices/high-alch.png?v=3', text: 'Alch' },
  qty: { label: 'Quantity', src: '/item-prices/qty.png?v=3', text: 'Qty' },
} as const;

type BadgeKind = keyof typeof BADGES;

export function ItemsPanel({
  items,
  members = [],
}: {
  items: GroupItem[];
  members?: ReadonlyArray<MemberBadge>;
}) {
  const [query, setQuery] = useUrlText('q');
  const [page, setPage] = useUrlNumber('page', 1, { min: 1 });
  const [playerFilter, setPlayerFilter] = useUrlState('member', 'all');
  const [sort, setSort] = useUrlState<Sort>('sort', 'qty', { allowed: SORT_VALUES });
  const [priceMode, setPriceMode] = useUrlState<PriceMode>('price', 'stack', {
    allowed: PRICE_MODES,
  });

  const players = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      for (const share of item.shares) names.add(share.player);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const playerChoices = useMemo(
    () => memberOptions(players, members, 'All Players'),
    [players, members],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) && !String(item.id).includes(q)) return false;
      if (playerFilter !== 'all' && !item.shares.some((s) => s.player === playerFilter)) {
        return false;
      }
      return true;
    });

    if (playerFilter !== 'all') {
      list = list.map((item) => {
        const share = item.shares.find((s) => s.player === playerFilter);
        return { ...item, quantity: share?.quantity ?? 0, shares: share ? [share] : [] };
      });
    }

    // Price each item once; the comparator would otherwise re-price per compare.
    const priced: PricedItem[] = list.map((item) => {
      const prices = getItemPrices(item.id);
      return {
        ...item,
        stackGe: prices.ge * item.quantity,
        stackAlch: prices.alch * item.quantity,
      };
    });

    priced.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'ge') return b.stackGe - a.stackGe;
      if (sort === 'alch') return b.stackAlch - a.stackAlch;
      return b.quantity - a.quantity;
    });
    return priced;
  }, [items, query, playerFilter, sort]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, item) => ({
          types: acc.types + 1,
          quantity: acc.quantity + item.quantity,
          ge: acc.ge + item.stackGe,
          alch: acc.alch + item.stackAlch,
        }),
        { types: 0, quantity: 0, ge: 0, alch: 0 },
      ),
    [filtered],
  );

  const isSingleBank = playerFilter !== 'all';
  const pageSize = isSingleBank ? PAGE_SIZE_BANK : PAGE_SIZE_ALL;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <section className="gms-items" aria-label="Group items">
      <div className="gms-items-heading">
        <div className="gms-items-heading-main">
          <h2 className="gms-items-title">{bankTitle(playerFilter)}</h2>
          <div className="gms-items-totals" aria-label="Bank totals">
            <span className="gms-items-stat">
              <em>Items</em>
              <strong>{totals.types.toLocaleString()}</strong>
            </span>
            <span className="gms-items-stat gms-items-stat--qty">
              <img src={BADGES.qty.src} alt="" width={16} height={16} />
              <strong>{formatQty(totals.quantity)}</strong>
            </span>
            <span className="gms-items-stat gms-items-stat--ge">
              <img src={BADGES.ge.src} alt="" width={16} height={16} />
              <strong>{formatGp(totals.ge)}</strong>
            </span>
            <span className="gms-items-stat gms-items-stat--alch">
              <img src={BADGES.alch.src} alt="" width={16} height={16} />
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

        <Pagination
          page={safePage}
          pageCount={pageCount}
          maxButtons={MAX_PAGE_BUTTONS}
          onSelect={setPage}
        />

        <div className="gms-items-price-mode" role="group" aria-label="Price display">
          {(['each', 'stack'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={
                priceMode === mode
                  ? 'gms-items-mode-btn gms-items-mode-btn--active'
                  : 'gms-items-mode-btn'
              }
              onClick={() => setPriceMode(mode)}
            >
              {mode === 'each' ? 'Each' : '× Qty'}
            </button>
          ))}
        </div>

        <select
          className="gms-items-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <IconSelect
          label="Filter player"
          hideLabel
          value={playerFilter}
          options={playerChoices}
          onChange={(value) => {
            setPlayerFilter(value);
            setPage(1);
          }}
        />
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

function displayPrices(item: GroupItem, priceMode: PriceMode) {
  const { ge, alch } = getItemPrices(item.id);
  const mult = priceMode === 'stack' ? item.quantity : 1;
  return { ge: ge * mult, alch: alch * mult };
}

function PriceBadge({
  kind,
  value,
  showLabel = false,
  format = 'gp',
}: {
  kind: BadgeKind;
  value: number;
  showLabel?: boolean;
  format?: 'gp' | 'qty';
}) {
  const meta = BADGES[kind];
  return (
    <span className={`gms-item-price-badge gms-item-price-badge--${kind}`} title={meta.label}>
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
        {item.shares.map((share, index) => (
          <li key={share.player}>
            <span className="gms-share-name">{share.player}</span>
            <span className="gms-share-qty">{formatQty(share.quantity)}</span>
            <div className="gms-share-track">
              <div
                className="gms-share-fill"
                style={{
                  width: `${item.quantity ? Math.max(6, Math.round((share.quantity / item.quantity) * 100)) : 0}%`,
                  background: BAR_COLORS[index % BAR_COLORS.length],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
