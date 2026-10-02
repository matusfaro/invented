import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import type { Manifest } from '../../shared/types';

export const DATA_DIR = resolve(import.meta.dirname, '../../data');

/** A failed write must leave the last complete feed/cache ledger intact. */
export function writeJsonAtomic(path: string, value: unknown): void {
  const encoded = JSON.stringify(value);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    const fd = openSync(temporary, 'wx');
    try { writeFileSync(fd, encoded); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, path);
    syncDirectory(dirname(path));
  } finally {
    rmSync(temporary, { force: true });
  }
}

function syncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

const JOURNAL = '.ingest-pending.json';
function outputPath(directory: string, relative: string): string {
  if (!/^(?:new|trending|expiring|meta)\/[A-Za-z0-9_.-]+\.json$/.test(relative) && relative !== 'manifest.json') {
    throw new Error('invalid ingest output path');
  }
  return join(directory, relative);
}

/** Roll forward an interrupted batch before reading its completion ledger. */
export function recoverJsonBatch(directory = DATA_DIR): boolean {
  const journal = join(directory, JOURNAL);
  if (!existsSync(journal)) return false;
  const batch = JSON.parse(readFileSync(journal, 'utf8')) as { version: number; outputs: Record<string, unknown> };
  if (batch.version !== 1 || !batch.outputs || Array.isArray(batch.outputs) || typeof batch.outputs !== 'object') {
    throw new Error('invalid pending ingest journal');
  }
  const entries = Object.entries(batch.outputs);
  for (const [relative] of entries) outputPath(directory, relative); // validate whole batch before writing
  for (const [relative, value] of entries) writeJsonAtomic(outputPath(directory, relative), value);
  rmSync(journal);
  syncDirectory(directory);
  return true;
}

/** Durable roll-forward journal; readers/deployment run only after this returns. */
export function commitJsonBatch(outputs: Record<string, unknown>, directory = DATA_DIR): void {
  for (const relative of Object.keys(outputs)) outputPath(directory, relative);
  recoverJsonBatch(directory);
  writeJsonAtomic(join(directory, JOURNAL), { version: 1, outputs });
  recoverJsonBatch(directory);
}

export function writeJson(relPath: string, value: unknown): void {
  const path = join(DATA_DIR, relPath);
  writeJsonAtomic(path, value);
  console.log(`  wrote ${relPath}`);
}

export function readJson<T>(relPath: string): T | null {
  const path = join(DATA_DIR, relPath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const EMPTY_MANIFEST: Manifest = { generatedAt: '', new: [], expiring: [], trending: [] };

/** Merge-update the manifest (sorted unique date lists). */
export function mergedManifest(patch: Partial<Record<'new' | 'expiring' | 'trending', string[]>>): Manifest {
  const manifest = readJson<Manifest>('manifest.json') ?? { ...EMPTY_MANIFEST };
  for (const key of ['new', 'expiring', 'trending'] as const) {
    if (patch[key]) manifest[key] = [...new Set([...manifest[key], ...patch[key]!])].sort();
  }
  manifest.generatedAt = new Date().toISOString();
  return manifest;
}

export function updateManifest(patch: Partial<Record<'new' | 'expiring' | 'trending', string[]>>): void {
  writeJson('manifest.json', mergedManifest(patch));
}

/** Idempotency ledger: which weekly files have already been ingested. */
export interface WeeksLedger {
  [grantTuesday: string]: { fileName: string; ingestedAt: string; grants: number };
}

export const readLedger = () => readJson<WeeksLedger>('meta/weeks.json') ?? {};
export const writeLedger = (ledger: WeeksLedger) => writeJson('meta/weeks.json', ledger);
