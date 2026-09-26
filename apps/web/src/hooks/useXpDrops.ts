import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerView } from '../lib/items';
import {
  diffXpDrops,
  mergeXpDrop,
  skillXpSnapshot,
  type CombinedXpDrop,
} from '../lib/xpDrops';

/**
 * Tracks XP gains between successive `players` snapshots and exposes one
 * combined floating drop per player. The first snapshot never produces drops.
 */
export function useXpDrops(players: PlayerView[]) {
  const [xpDropsByPlayer, setXpDropsByPlayer] = useState<Record<string, CombinedXpDrop>>({});
  const prevXpRef = useRef<Map<string, Map<string, number>> | null>(null);

  useEffect(() => {
    const gains = diffXpDrops(prevXpRef.current, players);
    prevXpRef.current = skillXpSnapshot(players);
    if (!gains.length) return;
    setXpDropsByPlayer((prev) => {
      const next = { ...prev };
      for (const gain of gains) {
        next[gain.playerName] = mergeXpDrop(
          next[gain.playerName],
          gain.skill,
          gain.amount,
          gain.displayName,
        );
      }
      return next;
    });
  }, [players]);

  const dismissXpDrop = useCallback((playerName: string, id: string) => {
    setXpDropsByPlayer((prev) => {
      const cur = prev[playerName];
      if (!cur || cur.id !== id) return prev;
      return Object.fromEntries(Object.entries(prev).filter(([name]) => name !== playerName));
    });
  }, []);

  return { xpDropsByPlayer, dismissXpDrop };
}
