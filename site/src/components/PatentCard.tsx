import type { PatentItem } from '../../../shared/types';
import { patentPdfUrl } from '../api';
import { industryOf } from '../cpc';
import { hrefFor } from '../router';
import { useModals } from '../App';

export function PatentCard({
  item,
  fresh,
  upvotes,
}: {
  item: PatentItem;
  fresh?: boolean;
  /** live citation count when known (trending); otherwise every patent starts at 0 */
  upvotes?: number;
}) {
  const modals = useModals();
  const detailHref = hrefFor(`/patent/${item.grantDate ? dateOfReveal(item) : ''}/${item.id}`);
  const industry = industryOf(item.cpc);
  return (
    <article className={`card ${fresh ? 'fresh' : ''}`}>
      <div className="vote">
        <button title="Upvoting requires citing this patent in your own patent application" onClick={() => modals.openUpvote(item)}>
          ▲
        </button>
        <span className={`count ${upvotes ? 'hot' : ''}`}>{upvotes ?? 0}</span>
      </div>
      <div className="card-body">
        <h3 className="card-title">
          <a href={detailHref}>{item.title}</a>
          {fresh && <span className="badge-new">JUST GRANTED</span>}
        </h3>
        <div className="card-meta">
          <span className="patent-no">US{item.id}{item.kind}</span>
          {item.assignee && (
            <a href={hrefFor(`/company/${encodeURIComponent(item.assignee)}`)}>{item.assignee}</a>
          )}
          {item.inventors[0] && (
            <a href={hrefFor(`/inventor/${encodeURIComponent(item.inventors[0])}`)}>
              {item.inventors[0]}
              {item.inventors.length > 1 ? ` +${item.inventors.length - 1}` : ''}
            </a>
          )}
          {industry && (
            <a className="chip" href={hrefFor(`/new?industry=${item.cpc[0][0]}`)}>
              {industry}
            </a>
          )}
          <span>{item.grantDate}</span>
        </div>
        {item.abstract && <p className="card-abstract">{item.abstract}</p>}
        <div className="card-actions">
          <a href={detailHref}>💬 comments</a>
          <a href={patentPdfUrl(item.id)} target="_blank" rel="noreferrer">
            pdf
          </a>
        </div>
      </div>
    </article>
  );
}

/** Detail routes encode the reveal date so the detail view knows which day file to fetch. */
export function dateOfReveal(item: PatentItem): string {
  return new Date(item.revealTs).toISOString().slice(0, 10);
}
