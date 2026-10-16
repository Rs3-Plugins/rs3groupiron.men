import { useEffect, useState } from 'react';
import { fetchAlchValues } from '../api/groupClient';

/**
 * High/low alchemy values, served by the API from the item catalogue.
 *
 * The wiki only publishes them for traded items, so the rest are derived from
 * the cache value the game bases them on; that happens when the catalogue is
 * generated, so everything is a plain lookup here.
 *
 * An item with no entry cannot be alched (no cache value), which is different
 * from alching for nothing — callers get 0 either way, but nothing is invented.
 */
let values: Record<number, [number, number?]> = {};
let started = false;
let version = 0;

const listeners = new Set<(v: number) => void>();

export function lookupAlch(itemId: number): { high: number; low: number } {
  const entry = values[itemId];
  if (!entry) return { high: 0, low: 0 };
  const [high, low] = entry;
  return { high, low: low ?? Math.floor((high * 2) / 3) };
}

export function hasAlchValues(): boolean {
  return version > 0;
}

function start() {
  if (started) return;
  started = true;
  fetchAlchValues()
    .then((catalogue) => {
      values = catalogue.alch ?? {};
      version += 1;
      for (const listener of listeners) listener(version);
    })
    .catch(() => {
      // Cosmetic: alch columns read 0 until a later load succeeds.
    });
}

/** Returns a counter that changes once the values have loaded. */
export function useAlchValues(): number {
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
