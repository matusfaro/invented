import type { ExpiringItem } from '../../shared/types';
import { normalizeDocNumber } from './parse-grants';

export function isoOf(raw: string): string | null {
  if (!/^\d{8}$/.test(raw)) return null;
  const date = raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6);
  const timestamp = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
}

/** Apply the cumulative file's documented EXP./EXPX semantics independent of input order. */
export function collectExpirationEvent(
  line: string, since: string, today: string,
  lapses: Map<string, ExpiringItem>, reinstated: Map<string, string>,
): void {
  if (line.length < 57) return;
  const code = line.slice(52, 57).trim();
  if (code !== 'EXP.' && code !== 'EXPX') return;
  const eventDate = isoOf(line.slice(43, 51));
  if (!eventDate || eventDate > today) return;
  const id = normalizeDocNumber(line.slice(0, 13).trim());
  if (!/^(?:RE)?\d+$/.test(id)) return;
  if (code === 'EXPX') {
    if (eventDate > (reinstated.get(id) ?? '')) reinstated.set(id, eventDate);
    return;
  }
  if (eventDate < since || eventDate <= (lapses.get(id)?.expiryDate ?? '')) return;
  lapses.set(id, {
    id, type: id.startsWith('RE') ? 'reissue' : 'utility',
    grantDate: isoOf(line.slice(34, 42)) ?? undefined,
    filingDate: isoOf(line.slice(25, 33)) ?? undefined,
    expiryDate: eventDate, reason: 'fee_lapse',
  });
}

export function reconcileExpirations(
  existing: ExpiringItem[], additions: ExpiringItem[], reinstated: Map<string, string>,
): ExpiringItem[] {
  const merged = new Map([...existing, ...additions].map((item) => [item.id, item]));
  return [...merged.values()]
    .filter((item) => item.reason !== 'fee_lapse' || (reinstated.get(item.id) ?? '') < item.expiryDate)
    .sort((a, b) => a.id.localeCompare(b.id));
}
