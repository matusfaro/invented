import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { DayFile, Manifest, PatentItem } from '../../shared/types';
import { fetchManifest, fetchNewDay, utcDateString } from './api';
import { useNow } from './reveal';
import { DayPages } from './dayPages';

export function useManifest(): Manifest | null {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void fetchManifest().then((m) => { if (alive && m) setManifest(m); }); };
    refresh();
    const timer = setInterval(refresh, 3_600_000);
    return () => {
      alive = false;
      clearInterval(timer);
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
  failedDates: string[];
  retry: () => void;
}

/**
 * Loads day files newest-first. Initially loads every file that can contain a
 * visible-or-next item (dates <= tomorrow UTC, so the countdown keeps working
 * across the midnight boundary); loadMore() pulls one older date per call for
 * infinite scroll.
 */
/** Shared guarded pagination: old responses cannot overwrite a changed date list. */
export function useDayPages<T extends { date: string }>(dates: string[], fetchDay: (date: string) => Promise<T | null>, batchSize = 3, revision = '') {
  const pages = useMemo(() => new DayPages(fetchDay, batchSize), [fetchDay, batchSize]);
  const state = useSyncExternalStore(pages.subscribe, pages.snapshot);
  useEffect(() => { pages.setDates(dates, revision); }, [pages, dates, revision]);
  useEffect(() => () => pages.dispose(), [pages]);
  return { ...state, loadMore: pages.loadMore, retry: pages.retry };
}

export function useNewFeed(manifest: Manifest | null): NewFeedData {
  const tomorrow = utcDateString(useNow(60_000) + 86_400_000);
  const dates = useMemo(() => manifest?.new.filter((d) => d <= tomorrow).slice().sort().reverse() ?? [], [manifest, tomorrow]);
  const feed = useDayPages<DayFile>(dates, fetchNewDay, 3, manifest?.generatedAt ?? '');
  const items = useMemo(() => feed.files.flatMap((day) => day.items), [feed.files]);
  return {
    items, failedDates: feed.failedDates, retry: feed.retry, loading: feed.loading, hasMore: feed.hasMore, loadMore: feed.loadMore,
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
