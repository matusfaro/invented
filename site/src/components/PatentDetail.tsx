import { useEffect, useState } from 'react';
import type { PatentItem } from '../../../shared/types';
import { fetchNewDay, googlePatentsUrl, patentPdfUrl } from '../api';
import { industryOf } from '../cpc';
import { hrefFor } from '../router';
import { useModals } from '../App';
import { Giscus } from './Giscus';

/** Route: #/patent/<reveal-date>/<id> — the date tells us which day file holds it. */
export function PatentDetail({ date, id }: { date: string; id: string }) {
  const [item, setItem] = useState<PatentItem | null | 'missing'>(null);
  const modals = useModals();

  useEffect(() => {
    void fetchNewDay(date).then((day) => {
      setItem(day?.items.find((i) => i.id === id) ?? 'missing');
    });
  }, [date, id]);

  if (item === null) return <div className="empty">loading…</div>;
  if (item === 'missing')
    return (
      <div className="empty">
        Can't find US{id} in the {date} drop.{' '}
        <a href={googlePatentsUrl(id)} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
          Try Google Patents
        </a>
        .
      </div>
    );

  // Not revealed yet? No spoilers — the feed's illusion holds even on deep links.
  if (item.revealTs > Date.now())
    return <div className="empty">This patent hasn't been granted yet*. Come back soon. <br />
      <small>*by our clock</small></div>;

  const industry = industryOf(item.cpc);
  return (
    <main className="detail">
      <a className="back" href={hrefFor('/new')}>
        ← back to the feed
      </a>
      <h1>{item.title}</h1>
      <div className="card-meta">
        <span className="patent-no">US{item.id}{item.kind}</span>
        {item.assignee && (
          <a href={hrefFor(`/company/${encodeURIComponent(item.assignee)}`)}>{item.assignee}</a>
        )}
        {industry && <span className="chip">{industry}</span>}
        <span>granted {item.grantDate}</span>
        {item.filingDate && <span>filed {item.filingDate}</span>}
      </div>

      {item.abstract && (
        <div className="detail-section">
          <p className="detail-abstract">{item.abstract}</p>
        </div>
      )}

      <div className="detail-section card-meta">
        inventors:{' '}
        {item.inventors.map((name, i) => (
          <a key={name} href={hrefFor(`/inventor/${encodeURIComponent(name)}`)}>
            {name}
            {i < item.inventors.length - 1 ? ',' : ''}
          </a>
        ))}
      </div>

      <div className="detail-section card-actions">
        <button onClick={() => modals.openUpvote(item)}>⬆ upvote (from $400)</button>
        <a href={googlePatentsUrl(item.id)} target="_blank" rel="noreferrer">
          google patents
        </a>
        <a href={patentPdfUrl(item.id)} target="_blank" rel="noreferrer">
          full pdf
        </a>
      </div>

      <div className="detail-section">
        <Giscus term={`US${item.id}`} />
      </div>
    </main>
  );
}
