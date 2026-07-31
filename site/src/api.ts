import type { DayFile, ExpiringDayFile, Manifest, TrendingFile } from '../../shared/types';

const BASE = import.meta.env.BASE_URL;

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}data/${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// The Pages CDN caches for 10 min; data ships >=1 day before reveal so staleness
// never hides content. The manifest is the only file where staleness is visible
// (a just-deployed week), so bust it with an hourly-rotating query param.
export function fetchManifest(): Promise<Manifest | null> {
  return fetchJson<Manifest>(`manifest.json?h=${Math.floor(Date.now() / 3_600_000)}`);
}

export const fetchNewDay = (date: string) => fetchJson<DayFile>(`new/${date}.json`);
export const fetchExpiringDay = (date: string) => fetchJson<ExpiringDayFile>(`expiring/${date}.json`);
export const fetchTrendingWeek = (week: string) => fetchJson<TrendingFile>(`trending/${week}.json`);

export function utcDateString(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function patentPdfUrl(id: string): string {
  return `https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/${id}`;
}
