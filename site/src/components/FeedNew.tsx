import type { Manifest } from '../../../shared/types';
import { applyFilters, filtersFromQuery, useNewFeed } from '../feedData';
import { useRevealFeed } from '../reveal';
import { PatentCard } from './PatentCard';
import { FilterBar } from './FilterBar';

export function FeedNew({ manifest, query }: { manifest: Manifest | null; query: URLSearchParams }) {
  const feed = useNewFeed(manifest);
  const { visible, freshIds } = useRevealFeed(feed.items);
  const filters = filtersFromQuery(query);
  const shown = applyFilters(visible, filters);

  return (
    <main>
      <FilterBar filters={filters} basePath="/new" items={visible} />

      {shown.map((item) => (
        <PatentCard key={item.id} item={item} fresh={freshIds.has(item.id)} />
      ))}

      {shown.length === 0 && !feed.loading && (
        <div className="empty">
          {feed.noData
            ? 'No data yet. Run the ingest pipeline.'
            : 'Nothing here (yet). Patents are being granted as we speak.'}
        </div>
      )}

      {feed.failedDates.length > 0 && <p role="status">Some days could not be loaded. <button onClick={feed.retry} disabled={feed.loading}>Retry</button></p>}
      {feed.hasMore && (
        <button className="loadmore" onClick={feed.loadMore} disabled={feed.loading}>
          {feed.loading ? 'loading…' : 'keep scrolling into the past'}
        </button>
      )}
    </main>
  );
}
