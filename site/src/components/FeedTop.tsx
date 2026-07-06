import type { Manifest } from '../../../shared/types';

/** TOP (all-time most-cited) is a post-MVP BigQuery job; teaser until then. */
export function FeedTop({ manifest }: { manifest: Manifest | null }) {
  if (manifest?.topPages) {
    return <div className="empty">TOP pages exist but the UI for them isn't wired yet.</div>;
  }
  return (
    <main>
      <div className="empty">
        <p>
          <b>TOP</b> ranks every US patent ever granted by all-time citations.
        </p>
        <p>
          Counting ~140 million citations takes a moment. This feed is being computed — meanwhile,
          TRENDING shows who's being cited <i>this week</i>.
        </p>
      </div>
    </main>
  );
}
