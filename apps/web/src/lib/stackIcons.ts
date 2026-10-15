import { useEffect, useState } from 'react';
import { fetchItemStacks } from '../api/groupClient';

/**
 * Stack-size icons: RS3 swaps an item's art as the pile grows, so 100 coins
 * should not render as a single coin.
 *
 * The icon CDN is keyed by item id but has nothing for the variant ids, so the
 * art comes from the wiki. Which file belongs to which quantity is resolved
 * when the catalogue is generated rather than guessed here, so a step the wiki
 * lacks simply falls back to the base icon instead of breaking.
 */
let steps: Record<number, Array<[number, string]>> = {};
let base = 'https://runescape.wiki/images/';
let started = false;
let version = 0;

const listeners = new Set<(v: number) => void>();

/**
 * The file for this quantity, or undefined to use the normal icon. Steps are
 * sorted ascending, so the last one at or below the quantity wins.
 */
export function stackIconUrl(itemId: number, quantity: number): string | undefined {
  const table = steps[itemId];
  if (!table || quantity < 2) return undefined;
  let file: string | undefined;
  for (const [from, candidate] of table) {
    if (quantity < from) break;
    file = candidate;
  }
  return file === undefined ? undefined : base + file;
}

function start() {
  if (started) return;
  started = true;
  fetchItemStacks()
    .then((catalogue) => {
      steps = catalogue.stacks ?? {};
      if (catalogue.base) base = catalogue.base;
      version += 1;
      for (const listener of listeners) listener(version);
    })
    .catch(() => {
      // Cosmetic: every item keeps its single-item icon.
    });
}

/** Returns a counter that changes once the stack table has loaded. */
export function useStackIcons(): number {
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
