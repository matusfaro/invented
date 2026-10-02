import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { assignRevealTimes, revealWindow, seededShuffle } from './schedule';
import { parseGrantDoc, parseGrantStream, openGrantSource, normalizeDocNumber } from './parse-grants';
import { collectExpirationEvent, reconcileExpirations, isoOf } from './expiration-events';
import { downloadFile, type OdpFile } from './odp';
import { writeJsonAtomic, commitJsonBatch, recoverJsonBatch } from './data-io';
import { DayPages } from '../../site/src/dayPages';
import { parseHash } from '../../site/src/routeCore';
import { revealFeed } from '../../site/src/reveal';
import type { ExpiringItem, PatentItem } from '../../shared/types';

const grant = (title = 'Café invention') =>
  '<?xml version="1.0" encoding="UTF-8"?><us-patent-grant><us-bibliographic-data-grant>' +
  '<publication-reference><document-id><doc-number>012345678</doc-number><kind>B2</kind><date>20260630</date></document-id></publication-reference>' +
  '<application-reference appl-type="utility"><document-id><date>20240101</date></document-id></application-reference>' +
  '<invention-title>' + title + '</invention-title></us-bibliographic-data-grant>' +
  '<abstract><p>Heat &amp; power &#x1f600;</p></abstract></us-patent-grant>';

test('grant UTF-8 survives every byte boundary and concatenated documents', async () => {
  const bytes = Buffer.from(grant() + grant('第二 invention'));
  const chunks = [...bytes].map((byte) => Buffer.from([byte]));
  const parsed = [];
  for await (const item of parseGrantStream(Readable.from(chunks))) parsed.push(item.item);
  assert.deepEqual(parsed.map((item) => item.title), ['Café invention', '第二 invention']);
  assert.equal(parsed[0].abstract, 'Heat & power 😀');
  assert.equal(parsed[0].id, '12345678');
});

test('truncated trailing grant aborts ingestion even after a valid document', async () => {
  const stream = Readable.from([Buffer.from(grant() + grant().replace('</us-patent-grant>', ''))]);
  await assert.rejects(async () => { for await (const _item of parseGrantStream(stream)) { /* consume */ } }, /incomplete final/);
});

test('invalid character references and prototype-named application types are safe', () => {
  assert.doesNotThrow(() => parseGrantDoc(grant().replace('&#x1f600;', '&#x110000; &#99999999; &constructor;')));
  assert.equal(parseGrantDoc(grant().replace('appl-type="utility"', 'appl-type="constructor"'))?.item.type, 'other');
  assert.equal(normalizeDocNumber('000000RE45992'), 'RE45992');
});

test('broken ZIP status reaches the consumer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'invented-zip-'));
  try {
    const file = join(dir, 'broken.zip');
    writeFileSync(file, 'invalid zip');
    await assert.rejects(async () => {
      for await (const _chunk of openGrantSource(file)) { /* consume */ }
    }, /unzip failed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('reveal windows reject rollover dates and preserve deterministic order', () => {
  for (const date of ['2026-02-30', '2026-13-01', '../bad', 'NaN']) assert.throws(() => revealWindow(date));
  const items = Array.from({ length: 20 }, (_, id) => ({ id }));
  const first = assignRevealTimes(items, '2026-06-30');
  const { start, end } = revealWindow('2026-06-30');
  assert.deepEqual(first, assignRevealTimes(items, '2026-06-30'));
  assert.deepEqual(first.map(({ id }) => id), seededShuffle(items, '2026-06-30').map(({ id }) => id));
  assert.ok(first.every((item) => item.revealTs >= start && item.revealTs < end));
  assert.equal(first[0].revealTs, Date.parse('2026-07-02T00:00:00Z'));
});

function feeLine(id: string, date: string, code: string): string {
  const row = Array<string>(59).fill(' ');
  for (const [offset, value] of [[0, id.padStart(13, '0')], [25, '20000101'], [34, '20050101'], [43, date], [52, code]] as const) {
    [...value].forEach((character, i) => { row[offset + i] = character; });
  }
  return row.join('');
}

test('maintenance events choose latest lapse regardless of order and normalize reissues', () => {
  const lapses = new Map<string, ExpiringItem>(), reinstated = new Map<string, string>();
  for (const date of ['20260912', '20260909', '20260230']) {
    collectExpirationEvent(feeLine('RE45992', date, 'EXP.'), '2026-01-01', '2026-10-01', lapses, reinstated);
  }
  assert.equal(lapses.get('RE45992')?.expiryDate, '2026-09-12');
  assert.equal(lapses.get('RE45992')?.type, 'reissue');
  collectExpirationEvent(feeLine('RE45992', '20261002', 'EXPX'), '2026-01-01', '2026-10-01', lapses, reinstated);
  assert.equal(reinstated.size, 0);
  assert.equal(isoOf('20260230'), null);
});

test('reinstatements remove previously published lapses outside the new event window', () => {
  const item: ExpiringItem = { id: '123', type: 'utility', reason: 'fee_lapse', expiryDate: '2025-01-01' };
  const lapses = new Map<string, ExpiringItem>(), reinstated = new Map<string, string>();
  collectExpirationEvent(feeLine('123', '20260901', 'EXPX'), '2026-09-30', '2026-10-01', lapses, reinstated);
  assert.deepEqual(reconcileExpirations([item], [], reinstated), []);
  assert.deepEqual(reconcileExpirations([item], [{ ...item, expiryDate: '2026-09-02' }], reinstated).map((it) => it.expiryDate), ['2026-09-02']);
  assert.equal(reconcileExpirations([{ ...item, reason: 'term' }], [], reinstated).length, 1);
});

test('atomic JSON preserves previous output when serialization fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'invented-json-'));
  try {
    const file = join(dir, 'feed.json');
    writeJsonAtomic(file, { count: 1 });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.throws(() => writeJsonAtomic(file, circular));
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { count: 1 });
    assert.deepEqual(readdirSync(dir), ['feed.json']);
    writeJsonAtomic(file, { count: 2 });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { count: 2 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('truncated downloads preserve cached output and successful download replaces atomically', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'invented-download-'));
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.USPTO_API_KEY;
  process.env.USPTO_API_KEY = 'local-fixture-only';
  const file: OdpFile = { fileName: 'fixture.zip', fileSize: 4, fileDownloadURI: 'https://example.invalid/fixture', fileDataFromDate: '2026-06-30' };
  try {
    const path = join(dir, file.fileName);
    writeFileSync(path, 'old');
    globalThis.fetch = async () => new Response('xx');
    await assert.rejects(downloadFile(file, path), /size differs/);
    assert.equal(readFileSync(path, 'utf8'), 'old');
    assert.deepEqual(readdirSync(dir), ['fixture.zip']);
    globalThis.fetch = async () => new Response('done');
    await downloadFile(file, path);
    assert.equal(readFileSync(path, 'utf8'), 'done');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.USPTO_API_KEY;
    else process.env.USPTO_API_KEY = previousKey;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('limited ingest refuses publishing before any network access', () => {
  const cwd = resolve(import.meta.dirname, '..');
  for (const args of [['--limit', '2'], ['--limit', 'NaN', '--dry-run'], ['--week', '2026-02-30']]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'ingest-grants.ts', ...args], { cwd, encoding: 'utf8', timeout: 15_000, env: { ...process.env, USPTO_API_KEY: '' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--limit|invalid grant date/);
    assert.doesNotMatch(result.stdout, /listing PTGRXML/);
  }
});

test('local dry-run completes grants and expiration ZIP failure prevents success', () => {
  const dir = mkdtempSync(join(tmpdir(), 'invented-cli-'));
  const cwd = resolve(import.meta.dirname, '..');
  try {
    const source = join(dir, 'ipg260630.xml');
    writeFileSync(source, grant());
    const options = { cwd, encoding: 'utf8' as const, timeout: 15_000, env: { ...process.env, USPTO_API_KEY: '' } };
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'ingest-grants.ts', '--from-file', source, '--dry-run', '--limit', '1'], options);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no files written/);
    const broken = join(dir, 'broken.zip');
    writeFileSync(broken, 'invalid zip');
    const expiration = spawnSync(process.execPath, ['--import', 'tsx', 'ingest-expirations.ts', '--from-file', broken, '--dry-run'], options);
    assert.equal(expiration.status, 1, expiration.stderr);
    assert.match(expiration.stderr, /unzip failed/);
    assert.doesNotMatch(expiration.stdout, /no files written/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('routes tolerate malformed escapes and retain question marks inside query values', () => {
  assert.deepEqual(parseHash('#/company/%broken').parts, ['company', '%broken']);
  assert.deepEqual(parseHash('#/company/Caf%C3%A9').parts, ['company', 'Café']);
  assert.equal(parseHash('#/new?company=a?b').query.get('company'), 'a?b');
});

test('reveal boundary includes exactly due items and finds the next event', () => {
  const base = parseGrantDoc(grant())!.item;
  const items: PatentItem[] = [100, 200, 300].map((revealTs) => ({ ...base, id: String(revealTs), revealTs }));
  assert.deepEqual(revealFeed(items, 200).visible.map((item) => item.id), ['200', '100']);
  assert.equal(revealFeed(items, 200).nextRevealTs, 300);
});

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
test('pagination retries failed days and preserves expanded history on refresh', async () => {
  let failing = true;
  const pages = new DayPages(async (date: string) => date === 'd2' && failing ? null : { date }, 1);
  pages.setDates(['d3', 'd2', 'd1'], 'v1');
  await tick();
  pages.loadMore(); await tick();
  assert.deepEqual(pages.snapshot().failedDates, ['d2']);
  failing = false; pages.retry(); await tick();
  pages.loadMore(); await tick();
  assert.equal(pages.snapshot().files.length, 3);
  pages.setDates(['d4', 'd3', 'd2', 'd1'], 'v2');
  assert.equal(pages.snapshot().files.length, 3);
  await tick();
  assert.deepEqual(pages.snapshot().files.map((file) => file.date), ['d4', 'd3', 'd2', 'd1']);
  assert.deepEqual(pages.snapshot().failedDates, []);
});

test('pagination rejects stale responses and remount can restart disposed loads', async () => {
  let complete!: (value: { date: string }) => void;
  const pages = new DayPages<{ date: string }>((date: string) => date === 'old' ? new Promise<{ date: string }>((resolve) => { complete = resolve; }) : Promise.resolve({ date }), 1);
  pages.setDates(['old']);
  pages.setDates(['new']);
  complete({ date: 'old' }); await tick();
  assert.deepEqual(pages.snapshot().files, [{ date: 'new' }]);
  pages.dispose();
  pages.setDates(['new']);
  await tick();
  assert.equal(pages.snapshot().loading, false);
});

test('ingest journal rolls forward a partially published batch and then disappears', () => {
  const dir = mkdtempSync(join(tmpdir(), 'invented-journal-'));
  try {
    writeJsonAtomic(join(dir, 'new/2026-07-02.json'), { count: 1 });
    writeJsonAtomic(join(dir, 'meta/weeks.json'), {});
    const outputs = { 'new/2026-07-02.json': { count: 2 }, 'manifest.json': { new: ['2026-07-02'] }, 'meta/weeks.json': { complete: true } };
    writeJsonAtomic(join(dir, '.ingest-pending.json'), { version: 1, outputs });
    assert.equal(recoverJsonBatch(dir), true);
    assert.equal(recoverJsonBatch(dir), false);
    for (const [file, value] of Object.entries(outputs)) assert.deepEqual(JSON.parse(readFileSync(join(dir, file), 'utf8')), value);
    commitJsonBatch({ 'meta/weeks.json': { complete: 'next' } }, dir);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'meta/weeks.json'), 'utf8')), { complete: 'next' });
    assert.throws(() => commitJsonBatch({ '../outside.json': {} }, dir), /invalid ingest output/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bibliographic fixtures retain mixed-content title order, applicant fallback and citations', () => {
  const fixture = readFileSync(resolve(import.meta.dirname, '../fixtures/mixed-grant.xml'), 'utf8');
  const parsed = parseGrantDoc(fixture)!;
  assert.equal(parsed.item.title, 'A smart device for Café');
  assert.deepEqual(parsed.item.inventors, ['Ada Lovelace']);
  assert.equal(parsed.item.assignee, 'Example Research');
  assert.deepEqual(parsed.item.cpc, ['H01M']);
  assert.deepEqual(parsed.citations, [{ id: '1234567', name: 'Earlier inventor', date: '2000-01-01' }]);
});
