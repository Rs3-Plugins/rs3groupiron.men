import { hasAlchValues, lookupAlch } from './alchValues';
import { hasGePrices, lookupGePrice } from './gePrices';

/**
 * GE prices come from the RuneScape Wiki real-time feed, refreshed by the API
 * twice a day. High alch comes from the item catalogue: the wiki publishes it
 * for traded items, and the rest are derived from the cache value the game
 * bases them on.
 *
 * The small table below only backs the first render, before either has loaded.
 */

const KNOWN: Record<number, { ge: number; alch: number }> = {
  995: { ge: 1, alch: 1 }, // Coins
  4151: { ge: 85_000, alch: 72_000 }, // Abyssal whip
  11694: { ge: 12_500_000, alch: 750_000 }, // Armadyl godsword
  1127: { ge: 38_000, alch: 39_000 }, // Rune platebody
  1079: { ge: 37_000, alch: 38_400 }, // Rune platelegs
  1351: { ge: 150, alch: 9 }, // Bronze axe
  1265: { ge: 120, alch: 9 }, // Bronze pickaxe
  1511: { ge: 250, alch: 2 }, // Logs
  440: { ge: 180, alch: 10 }, // Iron ore
  554: { ge: 45, alch: 3 }, // Fire rune
  560: { ge: 220, alch: 108 }, // Death rune
  565: { ge: 480, alch: 240 }, // Blood rune
  6685: { ge: 6_500, alch: 120 }, // Saradomin brew
  3024: { ge: 8_200, alch: 144 }, // Super restore
  15259: { ge: 1_850_000, alch: 33_000 }, // Dragon hatchet
  2434: { ge: 9_100, alch: 144 }, // Prayer potion
  23351: { ge: 95_000, alch: 300 }, // Elder overload
  23354: { ge: 42_000, alch: 180 }, // Holy agony
};

function hashPrice(itemId: number, salt: number) {
  let n = (itemId * 2654435761) >>> 0;
  n ^= salt * 1597334677;
  n = Math.imul(n ^ (n >>> 16), 2246822507);
  return n >>> 0;
}

export type ItemPrices = {
  ge: number;
  alch: number;
};

/**
 * Per-item GE (real) and high alch (still placeholder).
 *
 * An item absent from the GE feed is untradeable, so it reports 0 rather than
 * a guess. Until the feed has loaded there is nothing to report, so the old
 * placeholder still backs the first render and keeps the panel from flashing
 * every price to zero.
 */
export function getItemPrices(itemId: number): ItemPrices {
  const known = KNOWN[itemId];
  const ge = hasGePrices()
    ? lookupGePrice(itemId)
    : (known?.ge ?? 50 + (hashPrice(itemId, 1) % 250_000));
  const alch = hasAlchValues() ? lookupAlch(itemId).high : (known?.alch ?? 0);
  return { ge, alch };
}

const GP_SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/** Accepts `50`, `2k`, `1.5m`, `1,000`. Returns null for anything else. */
export function parseGp(input: string): number | null {
  const m = input.trim().toLowerCase().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] ? GP_SUFFIX[m[2]]! : 1));
}

export function formatGp(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 10_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
