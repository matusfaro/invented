// Shared JSON shapes between pipeline (writer) and site (reader).
// All timestamps are epoch milliseconds, UTC.

export type PatentType = 'utility' | 'design' | 'plant' | 'reissue' | 'other';

export interface PatentItem {
  /** Patent number without country/kind, e.g. "12345678" or "D1034567" */
  id: string;
  kind: string; // e.g. "B2", "S1"
  type: PatentType;
  title: string;
  /** Truncated to ~300 chars by the pipeline to keep day files small */
  abstract?: string;
  assignee?: string;
  inventors: string[];
  /** CPC subclasses, e.g. ["G06F", "H04L"] — first entry is the primary */
  cpc: string[];
  grantDate: string; // YYYY-MM-DD
  filingDate?: string; // YYYY-MM-DD
  revealTs: number;
}

export interface DayFile {
  date: string; // YYYY-MM-DD (UTC) — the day these items reveal
  count: number;
  items: PatentItem[]; // sorted by revealTs ascending
}

export interface TrendingCiting {
  id: string;
  revealTs: number;
}

export interface TrendingItem {
  /** The cited (older) patent's number */
  id: string;
  /** First-named patentee from the citation record — the XML carries no title */
  patentee?: string;
  grantDate?: string; // YYYY-MM-DD when present in the citation record
  /** This week's newly granted patents citing it, with their NEW-feed reveal times */
  citedBy: TrendingCiting[];
}

export interface TrendingFile {
  /** Grant Tuesday of the week this tally covers, YYYY-MM-DD */
  week: string;
  generatedAt: string;
  items: TrendingItem[]; // sorted by citedBy.length descending
}

export type ExpiryReason = 'term' | 'fee_lapse';

export interface ExpiringItem {
  id: string;
  type: PatentType;
  title?: string;
  grantDate?: string;
  filingDate?: string;
  expiryDate: string; // YYYY-MM-DD — always in the past when revealed (reveal-late rule)
  reason: ExpiryReason;
}

export interface ExpiringDayFile {
  date: string;
  items: ExpiringItem[];
}

export interface Manifest {
  generatedAt: string;
  /** Available data/new/<date>.json dates, ascending. Includes future (pre-published) days. */
  new: string[];
  /** Available data/expiring/<date>.json dates, ascending */
  expiring: string[];
  /** Available data/trending/<week>.json week ids, ascending */
  trending: string[];
  /** Page count of data/top/page-N.json when the post-MVP TOP job lands */
  topPages?: number;
}
