import { useEffect, useMemo, useRef, useState } from 'react';
import type { PatentItem } from '../../shared/types';

/**
 * The reveal engine. Everything shipped in the static day files is future-dated;
 * an item exists for the user only once `revealTs <= now`. This hook re-renders
 * exactly when the next item crosses its reveal time (plus a 1s heartbeat for
 * countdown displays), so the feed "ticks" live with zero network traffic.
 */
export function useNow(heartbeatMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), heartbeatMs);
    return () => clearInterval(t);
  }, [heartbeatMs]);
  return now;
}

export interface RevealedFeed {
  /** Revealed items, newest first */
  visible: PatentItem[];
  /** Reveal time of the next hidden item, or null when the loaded days are exhausted */
  nextRevealTs: number | null;
  /** ids revealed within the last minute — for the "just arrived" animation */
  freshIds: Set<string>;
}

export function revealFeed(items: PatentItem[], now: number): RevealedFeed {
  const visible: PatentItem[] = [];
  let nextRevealTs: number | null = null;
  const freshIds = new Set<string>();
  for (const it of items) {
    if (it.revealTs <= now) {
      visible.push(it);
      if (now - it.revealTs < 60_000) freshIds.add(it.id);
    } else if (nextRevealTs === null || it.revealTs < nextRevealTs) {
      nextRevealTs = it.revealTs;
    }
  }
  visible.sort((a, b) => b.revealTs - a.revealTs);
  return { visible, nextRevealTs, freshIds };
}

export function useRevealFeed(items: PatentItem[]): RevealedFeed {
  const now = useNow();
  // Recompute only when time or inputs change; items arrays are replaced, not mutated.
  const ref = useRef(items);
  ref.current = items;
  return useMemo(() => revealFeed(ref.current, now), [now, items]);
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
