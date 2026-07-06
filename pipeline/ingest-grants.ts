/**
 * Weekly grant ingest: PTGRXML zip → per-day data/new/<date>.json (NEW feed,
 * reveal-scheduled) + data/trending/<grant-tuesday>.json (citation tally).
 *
 * Runs identically locally and in CI (thin-workflow rule):
 *   USPTO_API_KEY=... pnpm run ingest                  # latest weekly drop
 *   pnpm run ingest -- --week 2026-06-30               # specific week
 *   pnpm run ingest -- --from-file ./ipg260630.zip     # no API needed
 *   pnpm run ingest -- --dry-run --limit 100           # parse only, no writes
 *   pnpm run ingest -- --force                         # re-ingest despite ledger
 */
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { DayFile, PatentItem, TrendingFile, TrendingItem } from '../shared/types';
import { downloadFile, listProductFiles } from './lib/odp';
import { openGrantSource, parseGrantStream, type ParsedGrant } from './lib/parse-grants';
import { assignRevealTimes } from './lib/schedule';
import { readLedger, updateManifest, writeJson, writeLedger } from './lib/data-io';

const TRENDING_TOP_N = 200;

const { values: args } = parseArgs({
  // pnpm forwards the `--` separator token itself; drop it
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    week: { type: 'string' }, // grant Tuesday YYYY-MM-DD; default latest
    'from-file': { type: 'string' }, // local .zip or .xml — skips the ODP API
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    limit: { type: 'string' }, // parse at most N grants (dev)
    'cache-dir': { type: 'string', default: resolve(import.meta.dirname, '.cache') },
  },
});

function grantTuesdayFromFileName(name: string): string | null {
  const m = name.match(/ipg(\d{2})(\d{2})(\d{2})/);
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null;
}

async function resolveSource(): Promise<{ path: string; grantTuesday: string }> {
  if (args['from-file']) {
    const path = resolve(args['from-file']);
    const grantTuesday =
      args.week ?? grantTuesdayFromFileName(path) ?? new Date().toISOString().slice(0, 10);
    return { path, grantTuesday };
  }
  console.log('listing PTGRXML files…');
  const files = await listProductFiles('PTGRXML', {
    latest: !args.week,
    fromDate: args.week,
    toDate: args.week,
  });
  const file = files[0];
  if (!file) throw new Error(`no PTGRXML file found${args.week ? ` for week ${args.week}` : ''}`);
  mkdirSync(args['cache-dir']!, { recursive: true });
  const dest = resolve(args['cache-dir']!, file.fileName);
  await downloadFile(file, dest);
  return { path: dest, grantTuesday: file.fileDataFromDate };
}

async function main(): Promise<void> {
  const { path, grantTuesday } = await resolveSource();
  if (!existsSync(path)) throw new Error(`source not found: ${path}`);

  const ledger = readLedger();
  if (ledger[grantTuesday] && !args.force && !args['dry-run']) {
    console.log(`week ${grantTuesday} already ingested (${ledger[grantTuesday].grants} grants) — nothing to do`);
    return;
  }

  console.log(`parsing ${path} (week of ${grantTuesday})…`);
  const limit = args.limit ? Number(args.limit) : Infinity;
  const grants: ParsedGrant[] = [];
  for await (const grant of parseGrantStream(openGrantSource(path))) {
    grants.push(grant);
    if (grants.length % 1000 === 0) console.log(`  parsed ${grants.length} grants…`);
    if (grants.length >= limit) break;
  }
  console.log(`parsed ${grants.length} grants`);
  if (grants.length === 0) throw new Error('parsed 0 grants — refusing to write anything');

  // ---- NEW feed: schedule reveals, bucket into per-day files ----
  const scheduled: PatentItem[] = assignRevealTimes(
    grants.map((g) => g.item),
    grantTuesday,
  );
  const revealTsById = new Map(scheduled.map((it) => [it.id, it.revealTs]));

  const byDay = new Map<string, PatentItem[]>();
  for (const item of scheduled) {
    const day = new Date(item.revealTs).toISOString().slice(0, 10);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(item);
  }

  // ---- TRENDING: tally which patents this week's grants cite ----
  const tally = new Map<string, TrendingItem>();
  for (const g of grants) {
    const revealTs = revealTsById.get(g.item.id);
    if (revealTs === undefined) continue;
    for (const cit of g.citations) {
      let t = tally.get(cit.id);
      if (!t) {
        t = { id: cit.id, patentee: cit.name, grantDate: cit.date, citedBy: [] };
        tally.set(cit.id, t);
      }
      t.citedBy.push({ id: g.item.id, revealTs });
    }
  }
  const trending: TrendingFile = {
    week: grantTuesday,
    generatedAt: new Date().toISOString(),
    items: [...tally.values()]
      .sort((a, b) => b.citedBy.length - a.citedBy.length)
      .slice(0, TRENDING_TOP_N)
      .map((t) => ({ ...t, citedBy: t.citedBy.sort((a, b) => a.revealTs - b.revealTs) })),
  };

  // ---- report ----
  const days = [...byDay.keys()].sort();
  console.log(`\nweek ${grantTuesday}: ${scheduled.length} grants across ${days.length} days`);
  for (const d of days) console.log(`  ${d}: ${byDay.get(d)!.length}`);
  const topCited = trending.items[0];
  if (topCited)
    console.log(
      `trending: ${trending.items.length} patents; #1 = US${topCited.id} (${topCited.patentee ?? '?'}) cited by ${topCited.citedBy.length}`,
    );

  if (args['dry-run']) {
    console.log('\n--dry-run: no files written');
    return;
  }

  for (const d of days) {
    const items = byDay.get(d)!.sort((a, b) => a.revealTs - b.revealTs);
    const file: DayFile = { date: d, count: items.length, items };
    writeJson(`new/${d}.json`, file);
  }
  writeJson(`trending/${grantTuesday}.json`, trending);
  updateManifest({ new: days, trending: [grantTuesday] });
  ledger[grantTuesday] = {
    fileName: path.split('/').pop()!,
    ingestedAt: new Date().toISOString(),
    grants: grants.length,
  };
  writeLedger(ledger);
  console.log('\ndone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
