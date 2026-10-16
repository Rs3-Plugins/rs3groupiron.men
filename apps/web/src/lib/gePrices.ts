import { useEffect, useState } from 'react';
import { fetchGePrices } from '../api/groupClient';

/**
 * Grand Exchange prices, served by the API from the RuneScape Wiki's
 * real-time feed and refreshed there twice a day.
 *
 * Same shape as lib/itemNames: a module-level map so the plain `getItemPrices`
 * function can read it, plus a hook so components re-render when it lands.
 * Only traded items appear — an untradeable item has no GE price and reports 0
 * rather than a guess.
 */
let prices: Record<number, number> = {};
let started = false;
let version = 0;

const listeners = new Set<(v: number) => void>();

export function lookupGePrice(itemId: number): number {
  return prices[itemId] ?? 0;
}

export function hasGePrices(): boolean {
  return version > 0;
}

function start() {
  if (started) return;
  started = true;
  fetchGePrices()
    .then((catalogue) => {
      prices = catalogue.prices ?? {};
      version += 1;
      for (const listener of listeners) listener(version);
    })
    .catch(() => {
      // Prices are cosmetic; on failure everything reports 0.
    });
}

/** Returns a counter that changes once prices have loaded. */
export function useGePrices(): number {
  const [current, setCurrent] = useState(version);
  useEffect(() => {
    start();
    listeners.add(setCurrent);
    setCurrent(version);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
}
