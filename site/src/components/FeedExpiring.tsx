import { useMemo } from 'react';
import type { ExpiringDayFile, ExpiringItem, Manifest } from '../../../shared/types';
import { fetchExpiringDay, patentPdfUrl, utcDateString } from '../api';
import { useDayPages } from '../feedData';
import { useNow } from '../reveal';

/**
 * EXPIRING reveals LATE, never early: the pipeline only lists a patent on a
 * given day after its computed expiry has passed, so everything shown is
 * already public domain.
 */
export function FeedExpiring({ manifest }: { manifest: Manifest | null }) {
  const today = utcDateString(useNow(60_000));
  const dates = useMemo(() => (manifest?.expiring ?? []).filter((d) => d <= today).slice().sort().reverse(), [manifest, today]);
  const { files: days, loading, hasMore, loadMore, failedDates, retry } = useDayPages<ExpiringDayFile>(dates, fetchExpiringDay, 3, manifest?.generatedAt ?? '');

  if (!manifest) return <div className="empty">loading…</div>;
  if (dates.length === 0)
    return <div className="empty">No expiration data yet — the expiring pipeline hasn't run.</div>;

  return (
    <main>
      <div className="ticker">
        <span className="dot" />
        <span>
          fresh <b>public domain</b> — patents whose 20-year term ran out or whose owner stopped
          paying the maintenance bill
        </span>
      </div>
      {days.map((day) => (
        <section key={day.date}>
          <p className="section-note">
            entered the public domain {day.date} · {day.items.length} patents
          </p>
          {day.items.map((item) => (
            <ExpiringCard key={item.id} item={item} />
          ))}
        </section>
      ))}
      {failedDates.length > 0 && <p role="status">Some days could not be loaded. <button onClick={retry} disabled={loading}>Retry</button></p>}
      {hasMore && (
        <button className="loadmore" onClick={loadMore} disabled={loading}>
          older obituaries
        </button>
      )}
    </main>
  );
}

function ExpiringCard({ item }: { item: ExpiringItem }) {
  return (
    <article className="card">
      <div className="vote">
        <span className="badge-expired">RIP</span>
      </div>
      <div className="card-body">
        <h3 className="card-title">
          <a href={patentPdfUrl(item.id)} target="_blank" rel="noreferrer">
            {item.title ?? `US ${item.id}`}
          </a>
        </h3>
        <div className="card-meta">
          <span className="patent-no">US{item.id}</span>
          {item.grantDate && <span>granted {item.grantDate}</span>}
          <span>
            {item.reason === 'fee_lapse'
              ? `owner stopped paying — lapsed ${item.expiryDate}`
              : `20-year term ended ${item.expiryDate}`}
          </span>
        </div>
        <div className="card-actions">
          <a href={patentPdfUrl(item.id)} target="_blank" rel="noreferrer">
            pdf
          </a>
          <span title="It's free now. Just build it.">✨ now free to copy</span>
        </div>
      </div>
    </article>
  );
}
