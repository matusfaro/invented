import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Manifest } from '../../shared/types';

export const DATA_DIR = resolve(import.meta.dirname, '../../data');

export function writeJson(relPath: string, value: unknown): void {
  const path = join(DATA_DIR, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
  console.log(`  wrote ${relPath}`);
}

export function readJson<T>(relPath: string): T | null {
  const path = join(DATA_DIR, relPath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const EMPTY_MANIFEST: Manifest = { generatedAt: '', new: [], expiring: [], trending: [] };

/** Merge-update the manifest (sorted unique date lists). */
export function updateManifest(patch: Partial<Record<'new' | 'expiring' | 'trending', string[]>>): void {
  const manifest = readJson<Manifest>('manifest.json') ?? EMPTY_MANIFEST;
  for (const key of ['new', 'expiring', 'trending'] as const) {
    if (patch[key]) manifest[key] = [...new Set([...manifest[key], ...patch[key]!])].sort();
  }
  manifest.generatedAt = new Date().toISOString();
  const path = join(DATA_DIR, 'manifest.json');
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2));
  console.log(`  updated manifest.json`);
}

/** Idempotency ledger: which weekly files have already been ingested. */
export interface WeeksLedger {
  [grantTuesday: string]: { fileName: string; ingestedAt: string; grants: number };
}

export const readLedger = () => readJson<WeeksLedger>('meta/weeks.json') ?? {};
export const writeLedger = (ledger: WeeksLedger) => writeJson('meta/weeks.json', ledger);
