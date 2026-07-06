import { useEffect, useState } from 'react';
import type { ExpiringDayFile, ExpiringItem, Manifest } from '../../../shared/types';
import { fetchExpiringDay, googlePatentsUrl, patentPdfUrl, utcDateString } from '../api';

/**
 * EXPIRING reveals LATE, never early: the pipeline only lists a patent on a
 * given day after its computed expiry has passed, so everything shown is
 * already public domain.
 */
export function FeedExpiring({ manifest }: { manifest: Manifest | null }) {
  const [days, setDays] = useState<ExpiringDayFile[]>([]);
  const [cursor, setCursor] = useState(0);

  const today = utcDateString(Date.now());
  const dates = (manifest?.expiring ?? []).filter((d) => d <= today).reverse();

  useEffect(() => {
    if (dates.length === 0 || days.length > 0) return;
    void Promise.all(dates.slice(0, 3).map(fetchExpiringDay)).then((files) => {
      setDays(files.filter((f): f is ExpiringDayFile => f !== null));
      setCursor(3);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  const loadMore = () => {
    void Promise.all(dates.slice(cursor, cursor + 3).map(fetchExpiringDay)).then((files) => {
      setDays((prev) => [...prev, ...files.filter((f): f is ExpiringDayFile => f !== null)]);
      setCursor((c) => c + 3);
    });
  };

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
      {cursor < dates.length && (
        <button className="loadmore" onClick={loadMore}>
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
          <a href={googlePatentsUrl(item.id)} target="_blank" rel="noreferrer">
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
          <a href={googlePatentsUrl(item.id)} target="_blank" rel="noreferrer">
            google patents
          </a>
          <a href={patentPdfUrl(item.id)} target="_blank" rel="noreferrer">
            pdf
          </a>
          <span title="It's free now. Just build it.">✨ now free to copy</span>
        </div>
      </div>
    </article>
  );
}
