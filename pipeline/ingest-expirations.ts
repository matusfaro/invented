/**
 * EXPIRING ingest: USPTO Maintenance Fee Events cumulative file (PTMNFEE2,
 * refreshed Tuesdays) → per-day data/expiring/<date>.json.
 *
 * MVP scope = FEE-LAPSE expirations only ("EXP." events: patent expired for
 * failure to pay maintenance fees). These are officially recorded with exact
 * dates, so the reveal-late rule ("never show a live patent as expired") holds
 * by construction. Term-based expiry (filing + 20y) is deliberately EXCLUDED:
 * Patent Term Adjustment routinely extends terms by months-to-years and this
 * file doesn't carry PTA, so filing+20y would mislabel live patents as dead.
 * Post-MVP: PTA lookup via the Patent File Wrapper API enables `reason: term`.
 *
 * An "EXPX" (reinstated) event newer than the "EXP." cancels the expiration.
 *
 * Fixed-width 59-char records (MaintFeeEventsFileDocumentation.doc, June 2018):
 *   1-13 patent number · 15-22 application number · 24 entity status ·
 *   26-33 filing date · 35-42 grant date · 44-51 event date · 53-57 event code
 *
 * Usage:
 *   USPTO_API_KEY=... pnpm run expiring                  # since ledger/28d ago
 *   pnpm run expiring -- --since 2026-06-01
 *   pnpm run expiring -- --from-file ./MaintFeeEvents.zip --dry-run
 */
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ExpiringDayFile, ExpiringItem } from '../shared/types';
import { downloadFile, listProductFiles } from './lib/odp';
import { openGrantSource } from './lib/parse-grants';
import { normalizeDocNumber } from './lib/parse-grants';
import { readJson, updateManifest, writeJson } from './lib/data-io';

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    since: { type: 'string' }, // include EXP events on/after this date
    'from-file': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'cache-dir': { type: 'string', default: resolve(import.meta.dirname, '.cache') },
  },
});

interface ExpiringMeta {
  lastProcessedEventDate?: string;
}

function isoOf(yyyymmdd: string): string | null {
  return /^\d{8}$/.test(yyyymmdd)
    ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}`
    : null;
}

async function resolveSource(): Promise<string> {
  if (args['from-file']) return resolve(args['from-file']);
  console.log('listing PTMNFEE2 files…');
  const files = await listProductFiles('PTMNFEE2', { latest: true });
  const file = files[0];
  if (!file) throw new Error('no PTMNFEE2 file found');
  mkdirSync(args['cache-dir']!, { recursive: true });
  const dest = resolve(args['cache-dir']!, file.fileName);
  return downloadFile(file, dest);
}

async function main(): Promise<void> {
  const meta = readJson<ExpiringMeta>('meta/expiring.json') ?? {};
  const since =
    args.since ??
    meta.lastProcessedEventDate ??
    new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  console.log(`collecting EXP. events in [${since} … ${today}]`);

  const path = await resolveSource();
  if (!existsSync(path)) throw new Error(`source not found: ${path}`);

  // patent → lapse candidate + latest reinstatement inside/after the window
  const lapses = new Map<string, ExpiringItem>();
  const reinstated = new Map<string, string>(); // patent id → EXPX event date
  let lines = 0;

  const rl = createInterface({ input: openGrantSource(path), crlfDelay: Infinity });
  for await (const line of rl) {
    lines++;
    if (lines % 2_000_000 === 0) console.log(`  ${lines / 1e6}M lines…`);
    if (line.length < 57) continue;
    const code = line.slice(52, 57).trim();
    if (code !== 'EXP.' && code !== 'EXPX') continue;
    const eventDate = isoOf(line.slice(43, 51));
    if (!eventDate) continue;
    const rawPatent = line.slice(0, 13).trim();
    const id = normalizeDocNumber(rawPatent);
    if (code === 'EXPX') {
      const prev = reinstated.get(id);
      if (!prev || eventDate > prev) reinstated.set(id, eventDate);
      continue;
    }
    if (eventDate < since || eventDate > today) continue;
    lapses.set(id, {
      id,
      type: rawPatent.startsWith('RE') ? 'reissue' : 'utility',
      grantDate: isoOf(line.slice(34, 42)) ?? undefined,
      filingDate: isoOf(line.slice(25, 33)) ?? undefined,
      expiryDate: eventDate,
      reason: 'fee_lapse',
    });
  }
  console.log(`  ${lines} lines scanned`);
  if (lines === 0) throw new Error('read 0 lines — refusing to continue');

  // Cancel lapses that were later reinstated.
  let cancelled = 0;
  for (const [id, item] of lapses) {
    const expx = reinstated.get(id);
    if (expx && expx >= item.expiryDate) {
      lapses.delete(id);
      cancelled++;
    }
  }

  const byDay = new Map<string, ExpiringItem[]>();
  for (const item of lapses.values()) {
    (byDay.get(item.expiryDate) ?? byDay.set(item.expiryDate, []).get(item.expiryDate)!).push(item);
  }
  const days = [...byDay.keys()].sort();
  console.log(
    `\n${lapses.size} lapsed patents across ${days.length} days (${cancelled} reinstatements cancelled)`,
  );
  for (const d of days.slice(-10)) console.log(`  ${d}: ${byDay.get(d)!.length}`);

  if (args['dry-run']) {
    console.log('\n--dry-run: no files written');
    return;
  }

  for (const d of days) {
    // Merge with any existing day file so overlapping windows stay idempotent.
    const existing = readJson<ExpiringDayFile>(`expiring/${d}.json`);
    const merged = new Map<string, ExpiringItem>();
    for (const it of existing?.items ?? []) merged.set(it.id, it);
    for (const it of byDay.get(d)!) merged.set(it.id, it);
    const items = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
    writeJson(`expiring/${d}.json`, { date: d, items } satisfies ExpiringDayFile);
  }
  updateManifest({ expiring: days });
  writeJson('meta/expiring.json', { lastProcessedEventDate: today } satisfies ExpiringMeta);
  console.log('\ndone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
