import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { dirname } from 'node:path';

/**
 * USPTO Open Data Portal Bulk Data API client.
 * ALL bulk downloads require a free API key since 2026-06-18 (USPTO.gov account
 * + ID.me identity verification, key issued at data.uspto.gov/myodp). The key
 * is sent as X-API-Key. Keys idle >90 days are deleted — the weekly cron keeps
 * ours warm.
 */
const API_BASE = 'https://api.uspto.gov/api/v1';

export interface OdpFile {
  fileName: string;
  fileDownloadURI: string;
  fileSize: number;
  fileDataFromDate: string; // grant Tuesday, YYYY-MM-DD
}

function apiKey(): string {
  const key = process.env.USPTO_API_KEY;
  if (!key) {
    throw new Error(
      'USPTO_API_KEY is not set. Get a free key at https://data.uspto.gov/myodp ' +
        '(requires USPTO.gov account + ID.me verification), or use --from-file for local testing.',
    );
  }
  return key;
}

async function odpFetch(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey() } });
    if (res.status === 429 && attempt <= 5) {
      const wait = Number(res.headers.get('retry-after') ?? attempt * 5) * 1000;
      console.log(`  429 rate-limited, waiting ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`ODP ${res.status} ${res.statusText} for ${url}`);
    return res;
  }
}

/** List a bulk product's files, newest first. */
export async function listProductFiles(
  productId: string,
  opts: { fromDate?: string; toDate?: string; latest?: boolean } = {},
): Promise<OdpFile[]> {
  const q = new URLSearchParams({ includeFiles: 'true' });
  if (opts.fromDate) q.set('fileDataFromDate', opts.fromDate);
  if (opts.toDate) q.set('fileDataToDate', opts.toDate);
  if (opts.latest) q.set('latest', 'true');
  const res = await odpFetch(`${API_BASE}/datasets/products/${productId}?${q}`);
  const body = (await res.json()) as {
    bulkDataProductBag?: Array<{ productFileBag?: { fileDataBag?: OdpFile[] } }>;
  };
  const files = body.bulkDataProductBag?.[0]?.productFileBag?.fileDataBag ?? [];
  return files.sort((a, b) => (a.fileDataFromDate < b.fileDataFromDate ? 1 : -1));
}

/** Download a product file to disk (skips when already cached with same size). */
export async function downloadFile(file: OdpFile, destPath: string): Promise<string> {
  if (existsSync(destPath) && statSync(destPath).size === file.fileSize) {
    console.log(`  cache hit: ${destPath}`);
    return destPath;
  }
  mkdirSync(dirname(destPath), { recursive: true });
  console.log(`  downloading ${file.fileName} (${(file.fileSize / 1e6).toFixed(0)} MB)…`);
  const res = await odpFetch(file.fileDownloadURI);
  if (!res.body) throw new Error('empty response body');
  await streamPipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath));
  return destPath;
}
