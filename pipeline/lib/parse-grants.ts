import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { XMLParser } from 'fast-xml-parser';
import type { PatentItem, PatentType } from '../../shared/types';

/**
 * Streaming parser for USPTO weekly Patent Grant Full-Text XML (ICE DTD v4.x).
 * The weekly file is thousands of standalone XML documents concatenated —
 * we split on the `<?xml` declaration and parse each document's bibliographic
 * head individually (everything past the abstract — drawings, description,
 * claims — is ~95% of the bytes and irrelevant, so it's cut before parsing).
 */

export interface ParsedGrant {
  item: Omit<PatentItem, 'revealTs'>;
  /** US patents this grant cites (the TRENDING raw material) */
  citations: Array<{ id: string; name?: string; date?: string }>;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  isArray: (name) =>
    ['inventor', 'us-citation', 'classification-cpc', 'assignee', 'us-applicant', 'p'].includes(
      name,
    ),
});

const APPL_TYPES: Record<string, PatentType> = {
  utility: 'utility',
  design: 'design',
  plant: 'plant',
  reissue: 'reissue',
};

/**
 * "D0989358" → "D989358", "011234567" → "11234567" (Google Patents style).
 * The maintenance-fee file zero-pads BEFORE the letter prefix too
 * ("000000RE45992" → "RE45992").
 */
export function normalizeDocNumber(raw: string): string {
  const m = raw.match(/^0*([A-Z]{0,2})0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : raw;
}

function isoDate(yyyymmdd?: string): string | undefined {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return undefined;
  // Citation records use 00 for unknown month/day — clamp to 01.
  const mm = yyyymmdd.slice(4, 6) === '00' ? '01' : yyyymmdd.slice(4, 6);
  const dd = yyyymmdd.slice(6) === '00' ? '01' : yyyymmdd.slice(6);
  return `${yyyymmdd.slice(0, 4)}-${mm}-${dd}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** fast-xml-parser leaves numeric character references intact — decode them. */
function decodeEntities(s: string): string {
  const codePoint = (original: string, value: number): string =>
    Number.isInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
      ? String.fromCodePoint(value)
      : original;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => codePoint(m, parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => codePoint(m, Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m);
}

function textOf(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return decodeEntities(String(node));
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([, v]) => textOf(v))
      .join(' ');
  }
  return '';
}

function personName(addressbook: Record<string, unknown> | undefined): string | undefined {
  if (!addressbook) return undefined;
  const org = textOf(addressbook['orgname']).trim();
  if (org) return org;
  const first = textOf(addressbook['first-name']).trim();
  const last = textOf(addressbook['last-name']).trim();
  const name = `${first} ${last}`.trim();
  return name || undefined;
}

export function parseGrantDoc(doc: string): ParsedGrant | null {
  // Cut everything after the abstract; biblio + abstract always precede it.
  const cutAt = doc.search(/<(drawings|description|us-claim-statement|claims)[\s>]/);
  const head = cutAt > 0 ? doc.slice(0, cutAt) + '</us-patent-grant>' : doc;

  let root: Record<string, any>;
  try {
    root = parser.parse(head);
  } catch {
    return null;
  }
  const grant = root['us-patent-grant'];
  if (!grant) return null;
  const biblio = grant['us-bibliographic-data-grant'];
  if (!biblio) return null;

  const pubDoc = biblio['publication-reference']?.['document-id'];
  const appRef = biblio['application-reference'];
  const appDoc = appRef?.['document-id'];
  if (!pubDoc?.['doc-number']) return null;

  const id = normalizeDocNumber(String(pubDoc['doc-number']));
  const kind = String(pubDoc['kind'] ?? '');
  const applType = String(appRef?.['@_appl-type'] ?? '');
  const type = Object.hasOwn(APPL_TYPES, applType) ? APPL_TYPES[applType] : 'other';

  const titleMarkup = doc.match(/<invention-title\b[^>]*>([\s\S]*?)<\/invention-title>/)?.[1];
  const title = (titleMarkup === undefined ? textOf(biblio['invention-title']) : decodeEntities(titleMarkup.replace(/<[^>]+>/g, ' ')))
    .replace(/\s+/g, ' ').trim();
  if (!title) return null;

  // Abstract straight from the raw XML: parsed-object traversal loses the
  // interleaving of inline elements (<figref>, <b>, …) with text, scrambling
  // sentences like "A device (1) for heating…". Tag-stripping keeps order.
  let abstract: string | undefined;
  const absMatch = doc.match(/<abstract[\s>][\s\S]*?<\/abstract>/);
  if (absMatch) {
    abstract =
      decodeEntities(absMatch[0].replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim() || undefined;
  }
  if (abstract && abstract.length > 300) abstract = `${abstract.slice(0, 297).trimEnd()}…`;

  // Inventors: v4.x puts them under us-parties > inventors (or applicants doubling as inventors)
  const parties = biblio['us-parties'] ?? biblio['parties'];
  const inventorNodes: any[] =
    parties?.['inventors']?.['inventor'] ??
    parties?.['us-applicants']?.['us-applicant']?.filter?.(
      (a: any) => a['@_app-type'] === 'applicant-inventor',
    ) ??
    [];
  const inventors = inventorNodes
    .map((inv) => personName(inv?.['addressbook']))
    .filter((n): n is string => !!n)
    .slice(0, 8);

  const assigneeNodes: any[] = biblio['assignees']?.['assignee'] ?? [];
  let assignee = assigneeNodes.map((a) => personName(a?.['addressbook'])).find(Boolean);
  if (!assignee) {
    const applicants: any[] = parties?.['us-applicants']?.['us-applicant'] ?? [];
    assignee = applicants
      .map((a) => textOf(a?.['addressbook']?.['orgname']).trim() || undefined)
      .find(Boolean);
  }

  // CPC: main first, then further; dedupe at subclass level (e.g. H01M)
  const cpcRoot = biblio['classifications-cpc'];
  const cpcNodes: any[] = [
    ...(cpcRoot?.['main-cpc']?.['classification-cpc'] ?? []),
    ...(cpcRoot?.['further-cpc']?.['classification-cpc'] ?? []),
  ];
  const cpc: string[] = [];
  for (const c of cpcNodes) {
    const sym = `${textOf(c?.['section'])}${String(textOf(c?.['class'])).padStart(2, '0')}${textOf(c?.['subclass'])}`;
    if (/^[A-HY]\d{2}[A-Z]$/.test(sym) && !cpc.includes(sym)) cpc.push(sym);
    if (cpc.length >= 3) break;
  }

  const citations: ParsedGrant['citations'] = [];
  const seenCited = new Set<string>();
  const citNodes: any[] = biblio['us-references-cited']?.['us-citation'] ?? [];
  for (const c of citNodes) {
    const d = c?.['patcit']?.['document-id'];
    if (!d || String(d['country']) !== 'US') continue;
    const docNum = String(d['doc-number'] ?? '');
    // Applications aren't granted patents; skip them. They appear as 11-digit
    // numbers ("20160026253") or slash-formatted publications ("2016/0026253").
    if (/^\d{11}$/.test(docNum) || docNum.includes('/')) continue;
    const citedId = normalizeDocNumber(docNum);
    if (!citedId || seenCited.has(citedId)) continue;
    seenCited.add(citedId);
    citations.push({
      id: citedId,
      name: textOf(d['name']).trim() || undefined,
      date: isoDate(String(d['date'] ?? '')),
    });
  }

  return {
    item: {
      id,
      kind,
      type,
      title,
      abstract,
      assignee,
      inventors,
      cpc,
      grantDate: isoDate(String(pubDoc['date'] ?? '')) ?? '',
      filingDate: isoDate(String(appDoc?.['date'] ?? '')),
    },
    citations,
  };
}

/** Split a concatenated multi-document XML stream and yield each parsed grant. */
export async function* parseGrantStream(stream: Readable): AsyncGenerator<ParsedGrant> {
  // Readable's StringDecoder preserves UTF-8 sequences split between ZIP chunks.
  stream.setEncoding('utf8');
  let buf = '';
  let docsSeen = 0;
  for await (const chunk of stream) {
    buf += chunk.toString('utf8');
    // Emit every complete document currently in the buffer.
    for (;;) {
      const start = buf.indexOf('<?xml');
      if (start < 0) break;
      const next = buf.indexOf('<?xml', start + 5);
      if (next < 0) break;
      const doc = buf.slice(start, next);
      if (doc.length > 64 * 1024 * 1024) throw new Error('grant document exceeds 64MB');
      if (!doc.includes('</us-patent-grant>')) throw new Error('incomplete grant XML document');
      buf = buf.slice(next);
      docsSeen++;
      const parsed = parseGrantDoc(doc);
      if (parsed) yield parsed;
    }
    // Safety: don't let a pathological buffer grow unbounded before a doc closes.
    if (buf.length > 64 * 1024 * 1024) throw new Error('grant document exceeds 64MB — parser desync?');
  }
  if (buf.includes('<?xml')) {
    if (!buf.includes('</us-patent-grant>')) throw new Error('incomplete final grant XML document');
    docsSeen++;
    const parsed = parseGrantDoc(buf.slice(buf.indexOf('<?xml')));
    if (parsed) yield parsed;
  }
  console.log(`  xml documents seen: ${docsSeen}`);
}

/** Open the weekly source as a text stream: .zip (via unzip -p) or plain .xml. */
export function openGrantSource(path: string): Readable {
  if (path.endsWith('.zip')) {
    const child = spawn('unzip', ['-p', path], { stdio: ['ignore', 'pipe', 'inherit'] });
    const exited = new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error('unzip failed (' + (signal ?? code) + ')'));
      });
    });
    void exited.catch(() => {});
    return Readable.from((async function* () {
      try {
        for await (const chunk of child.stdout) yield chunk;
        await exited;
      } finally {
        if (child.exitCode === null) child.kill();
      }
    })());
  }
  return createReadStream(path, 'utf8');
}
