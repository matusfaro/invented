import type { Manifest } from '../../../shared/types';
import { useNewFeed } from '../feedData';
import { useRevealFeed } from '../reveal';
import { PatentCard } from './PatentCard';
import { hrefFor } from '../router';

/**
 * Inventor/company profile. MVP scope: aggregates from the loaded feed window
 * (recent weeks of shipped data), not the full historical corpus — the outbound
 * Google Patents search covers the rest. Pre-baked entity JSONs are post-MVP.
 */
export function EntityPage({
  kind,
  name,
  manifest,
}: {
  kind: 'inventor' | 'company';
  name: string;
  manifest: Manifest | null;
}) {
  const feed = useNewFeed(manifest);
  const { visible, freshIds } = useRevealFeed(feed.items);

  const matches = visible.filter((it) =>
    kind === 'company'
      ? (it.assignee ?? '').toLowerCase() === name.toLowerCase()
      : it.inventors.some((n) => n.toLowerCase() === name.toLowerCase()),
  );

  const gpQuery =
    kind === 'company'
      ? `https://patents.google.com/?assignee=${encodeURIComponent(name)}`
      : `https://patents.google.com/?inventor=${encodeURIComponent(name)}`;

  return (
    <main>
      <div className="entity-head">
        <a className="back" href={hrefFor('/new')} style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          ← back to the feed
        </a>
        <h1>
          {kind === 'company' ? '🏢' : '👤'} {name}
        </h1>
        <p className="sub" style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          {matches.length} patent{matches.length === 1 ? '' : 's'} in the recent window ·{' '}
          <a href={gpQuery} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
            full history on Google Patents
          </a>
        </p>
      </div>
      {matches.map((item) => (
        <PatentCard key={item.id} item={item} fresh={freshIds.has(item.id)} />
      ))}
      {matches.length === 0 && !feed.loading && (
        <div className="empty">Nothing from {name} in the recently shipped weeks.</div>
      )}
      {feed.hasMore && (
        <button className="loadmore" onClick={feed.loadMore} disabled={feed.loading}>
          {feed.loading ? 'loading…' : 'search further back'}
        </button>
      )}
    </main>
  );
}
