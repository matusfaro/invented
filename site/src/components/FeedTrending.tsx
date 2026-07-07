import { useEffect, useState } from 'react';
import type { Manifest, TrendingFile, TrendingItem } from '../../../shared/types';
import { fetchTrendingWeek, googlePatentsUrl, patentPdfUrl } from '../api';
import { useNow } from '../reveal';
import { useModals } from '../App';

/**
 * Trending = older patents being cited by THIS week's new grants. Each citation
 * carries the citing patent's NEW-feed revealTs, so counts tick up live as the
 * citing patents "arrive" — a patent trends because patents citing it just
 * showed up in NEW.
 */
export function FeedTrending({ manifest }: { manifest: Manifest | null }) {
  const [files, setFiles] = useState<TrendingFile[] | null>(null);
  const now = useNow();

  // Load the two newest weeks: right after a new drop lands, its citing
  // patents haven't started revealing yet, so we fall back to the week still
  // mid-reveal rather than showing an empty list.
  const weeks = manifest?.trending.slice(-2).reverse() ?? [];
  const weeksKey = weeks.join(',');
  useEffect(() => {
    if (weeks.length)
      void Promise.all(weeks.map(fetchTrendingWeek)).then((fs) =>
        setFiles(fs.filter((f): f is TrendingFile => f !== null)),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeksKey]);

  if (!manifest) return <div className="empty">loading…</div>;
  if (weeks.length === 0 || !files)
    return <div className="empty">No trending data yet — the weekly tally hasn't run.</div>;

  const rankWeek = (f: TrendingFile) =>
    f.items
      .map((item) => ({ item, live: item.citedBy.filter((c) => c.revealTs <= now).length }))
      .filter((r) => r.live > 0)
      .sort((a, b) => b.live - a.live)
      .slice(0, 100);

  let file = files[0];
  let ranked = rankWeek(file);
  if (ranked.length === 0 && files[1]) {
    file = files[1];
    ranked = rankWeek(file);
  }

  return (
    <main>
      <div className="ticker">
        <span className="dot" />
        <span>
          patents gaining citations from grants arriving <b>this week</b> — counts climb as citing
          patents land in NEW
        </span>
      </div>
      <p className="section-note">
        week of {file.week} · titles coming soon — the weekly XML only names the patentee
      </p>
      {ranked.map(({ item, live }, i) => (
        <TrendingCard key={item.id} item={item} live={live} rank={i + 1} />
      ))}
      {ranked.length === 0 && (
        <div className="empty">The week just started — nothing has been cited yet. Refresh soon.</div>
      )}
    </main>
  );
}

function TrendingCard({ item, live, rank }: { item: TrendingItem; live: number; rank: number }) {
  const modals = useModals();
  return (
    <article className="card">
      <div className="vote">
        <button title="Upvoting requires citing this patent in your own patent application" onClick={() => modals.openUpvote(item)}>
          ▲
        </button>
        <span className="count hot">{live}</span>
      </div>
      <div className="card-body">
        <h3 className="card-title">
          <a href={googlePatentsUrl(item.id)} target="_blank" rel="noreferrer">
            #{rank} · US{item.id}
            {item.patentee ? ` — ${item.patentee}` : ''}
          </a>
        </h3>
        <div className="card-meta">
          {item.grantDate && <span>granted {item.grantDate}</span>}
          <span>
            cited by <b>{live}</b> patent{live === 1 ? '' : 's'} granted this week
          </span>
        </div>
        <div className="card-actions">
          <a href={googlePatentsUrl(item.id)} target="_blank" rel="noreferrer">
            google patents
          </a>
          <a href={patentPdfUrl(item.id)} target="_blank" rel="noreferrer">
            pdf
          </a>
          <button onClick={() => modals.openUpvote(item)}>⬆ upvote (from $400)</button>
        </div>
      </div>
    </article>
  );
}
