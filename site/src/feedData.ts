import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayFile, Manifest, PatentItem } from '../../shared/types';
import { fetchManifest, fetchNewDay, utcDateString } from './api';

export function useManifest(): Manifest | null {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    let alive = true;
    fetchManifest().then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
  }, []);
  return manifest;
}

export interface NewFeedData {
  items: PatentItem[];
  loading: boolean;
  /** true while older day files remain unloaded */
  hasMore: boolean;
  loadMore: () => void;
  /** manifest missing entirely — pipeline never ran */
  noData: boolean;
}

/**
 * Loads day files newest-first. Initially loads every file that can contain a
 * visible-or-next item (dates <= tomorrow UTC, so the countdown keeps working
 * across the midnight boundary); loadMore() pulls one older date per call for
 * infinite scroll.
 */
export function useNewFeed(manifest: Manifest | null): NewFeedData {
  const [days, setDays] = useState<Record<string, DayFile>>({});
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null); // index into dates (desc) of next unloaded
  const loadingRef = useRef(false);

  // Dates descending, excluding far-future pre-published days.
  const dates = useMemo(() => {
    if (!manifest) return [];
    const tomorrow = utcDateString(Date.now() + 86_400_000);
    return manifest.new.filter((d) => d <= tomorrow).reverse();
  }, [manifest]);

  const loadNext = useCallback(
    async (fromIndex: number, count: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      const slice = dates.slice(fromIndex, fromIndex + count);
      const files = await Promise.all(slice.map(fetchNewDay));
      setDays((prev) => {
        const next = { ...prev };
        files.forEach((f, i) => {
          if (f) next[slice[i]] = f;
        });
        return next;
      });
      setCursor(fromIndex + slice.length);
      setLoading(false);
      loadingRef.current = false;
    },
    [dates],
  );

  useEffect(() => {
    if (dates.length > 0 && cursor === null) {
      // initial: today+tomorrow (+1 spare so the feed isn't empty on quiet days)
      void loadNext(0, 3);
    }
  }, [dates, cursor, loadNext]);

  const items = useMemo(() => Object.values(days).flatMap((d) => d.items), [days]);

  return {
    items,
    loading,
    hasMore: cursor !== null && cursor < dates.length,
    loadMore: () => {
      if (cursor !== null) void loadNext(cursor, 1);
    },
    noData: manifest !== null && manifest.new.length === 0,
  };
}

/* ---------- client-side filters (industry / company / inventor) ---------- */

export interface Filters {
  industry?: string; // CPC section letter
  company?: string;
  inventor?: string;
}

export function filtersFromQuery(q: URLSearchParams): Filters {
  return {
    industry: q.get('industry') ?? undefined,
    company: q.get('company') ?? undefined,
    inventor: q.get('inventor') ?? undefined,
  };
}

export function filtersToQuery(f: Filters): string {
  const q = new URLSearchParams();
  if (f.industry) q.set('industry', f.industry);
  if (f.company) q.set('company', f.company);
  if (f.inventor) q.set('inventor', f.inventor);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function applyFilters(items: PatentItem[], f: Filters): PatentItem[] {
  return items.filter((it) => {
    if (f.industry && it.cpc[0]?.[0] !== f.industry) return false;
    if (f.company && (it.assignee ?? '').toLowerCase() !== f.company.toLowerCase()) return false;
    if (f.inventor && !it.inventors.some((n) => n.toLowerCase() === f.inventor!.toLowerCase()))
      return false;
    return true;
  });
}
