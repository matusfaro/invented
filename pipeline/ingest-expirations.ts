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
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ExpiringDayFile, ExpiringItem, Manifest } from '../shared/types';
import { downloadFile, listProductFiles } from './lib/odp';
import { openGrantSource } from './lib/parse-grants';
import { collectExpirationEvent, reconcileExpirations, isoOf } from './lib/expiration-events';
import { readJson, mergedManifest, commitJsonBatch, recoverJsonBatch } from './lib/data-io';

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

async function resolveSource(): Promise<string> {
  if (args['from-file']) return resolve(args['from-file']);
  console.log('listing PTMNFEE2 files…');
  const files = await listProductFiles('PTMNFEE2', { latest: true });
  const file = files[0];
  if (!file) throw new Error('no PTMNFEE2 file found');
  if (basename(file.fileName) !== file.fileName) throw new Error('unexpected source filename');
  mkdirSync(args['cache-dir']!, { recursive: true });
  const dest = resolve(args['cache-dir']!, file.fileName);
  return downloadFile(file, dest);
}

async function main(): Promise<void> {
  if (!args['dry-run']) recoverJsonBatch();
  const meta = readJson<ExpiringMeta>('meta/expiring.json') ?? {};
  const since =
    args.since ??
    meta.lastProcessedEventDate ??
    new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || isoOf(since.replaceAll('-', '')) !== since || since > today) {
    throw new Error('--since must be a valid date on or before today');
  }
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
    collectExpirationEvent(line, since, today, lapses, reinstated);
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

  // Reinstatements can cancel patents published before this run's new-event window.
  const outputs: Record<string, unknown> = {};
  const publishedDays = readJson<Manifest>('manifest.json')?.expiring ?? [];
  for (const d of new Set([...publishedDays, ...days])) {
    const existing = readJson<ExpiringDayFile>(`expiring/${d}.json`);
    const items = reconcileExpirations(existing?.items ?? [], byDay.get(d) ?? [], reinstated);
    if (!existing || JSON.stringify(items) !== JSON.stringify(existing.items)) {
      outputs[`expiring/${d}.json`] = { date: d, items } satisfies ExpiringDayFile;
    }
  }
  outputs["manifest.json"] = mergedManifest({ expiring: days });
  outputs["meta/expiring.json"] = { lastProcessedEventDate: today } satisfies ExpiringMeta;
  commitJsonBatch(outputs);
  console.log('\ndone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
