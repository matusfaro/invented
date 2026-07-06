/**
 * Reveal scheduling: spread a week's grants evenly across the 7 days AFTER
 * ingest. Window = grant-Tuesday + 2 days (Thursday 00:00 UTC) through +9 days.
 * The weekly cron runs Wednesday, so data is deployed ≥16h before the first
 * reveal — cron delays and the Pages 10-min CDN cache can never expose a gap.
 * Backfilled past weeks get past reveal timestamps and appear immediately as
 * history, which is exactly right.
 *
 * Order is a deterministic seeded shuffle (seeded by week id) so re-runs are
 * byte-identical (idempotent commits) but the feed mixes types/companies
 * instead of marching through the XML's sorted patent numbers.
 */

export function revealWindow(grantTuesday: string): { start: number; end: number } {
  const tuesday = Date.parse(`${grantTuesday}T00:00:00Z`);
  return { start: tuesday + 2 * 86_400_000, end: tuesday + 9 * 86_400_000 };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seedStr: string): T[] {
  let seed = 0;
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rand = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Assign evenly spaced reveal timestamps across the window. */
export function assignRevealTimes<T>(
  items: T[],
  grantTuesday: string,
): Array<T & { revealTs: number }> {
  const { start, end } = revealWindow(grantTuesday);
  const shuffled = seededShuffle(items, grantTuesday);
  const step = (end - start) / Math.max(shuffled.length, 1);
  return shuffled.map((item, i) => ({ ...item, revealTs: Math.round(start + i * step) }));
}
