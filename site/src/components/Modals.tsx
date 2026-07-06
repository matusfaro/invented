import type { ReactNode } from 'react';

/**
 * The joke is that everything is real: upvoting = citing the patent in your own
 * application, karma = forward citations, posting = filing. Fee numbers are the
 * USPTO's 2025 schedule (filing + search + examination for a utility patent);
 * they change — the official fee schedule link is the source of truth.
 */

function Modal({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>
          ✕
        </button>
        <h2>{title}</h2>
        <p className="sub">{sub}</p>
        {children}
      </div>
    </div>
  );
}

function FeeTable() {
  return (
    <table className="fee-table">
      <thead>
        <tr>
          <th>fee</th>
          <th>large co.</th>
          <th>small entity</th>
          <th>micro entity</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>filing</td><td>$350</td><td>$140</td><td>$70</td></tr>
        <tr><td>search</td><td>$770</td><td>$308</td><td>$154</td></tr>
        <tr><td>examination</td><td>$880</td><td>$352</td><td>$176</td></tr>
        <tr><td><b>to submit</b></td><td><b>$2,000</b></td><td><b>$800</b></td><td><b>$400</b></td></tr>
        <tr><td>issue (if granted)</td><td>$1,290</td><td>$516</td><td>$258</td></tr>
      </tbody>
    </table>
  );
}

export function UpvoteModal({ patentId, onClose }: { patentId: string; onClose: () => void }) {
  return (
    <Modal
      title="Upvote this patent"
      sub="On this site, karma is real. An upvote is a forward citation — and citations can only come from other patents."
      onClose={onClose}
    >
      <ol>
        <li>
          Invent something. Anything. (Improvements on US{patentId} are thematically appropriate.)
        </li>
        <li>
          File a US patent application at{' '}
          <a href="https://patentcenter.uspto.gov" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
            patentcenter.uspto.gov
          </a>
          . Fees to press the upvote button:
        </li>
      </ol>
      <FeeTable />
      <ol start={3}>
        <li>
          In your Information Disclosure Statement (form PTO/SB/08a), cite{' '}
          <code className="cite">US {patentId}</code> as prior art. That's the upvote.
        </li>
        <li>
          Wait ~25 months for examination. If your patent is granted, the upvote is counted —
          permanently, by the United States federal government.
        </li>
      </ol>
      <a className="cta" href="https://patentcenter.uspto.gov" target="_blank" rel="noreferrer">
        upvote for $400+ →
      </a>
      <p className="fine">
        Fees are the current USPTO schedule for a utility patent (basic filing + search +
        examination), before attorney costs (typically $8,000–$15,000). Verify at{' '}
        <a href="https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
          the official fee schedule
        </a>
        . Downvoting is not available; the USPTO does not accept negative citations. This is not
        legal advice.
      </p>
    </Modal>
  );
}

export function CreateModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Submit a post"
      sub="Anyone can post here. Posting is called 'filing a patent application' and moderation is called 'examination'."
      onClose={onClose}
    >
      <ol>
        <li>Reduce your idea to practice (a working description counts — no prototype needed).</li>
        <li>
          Optional but wise: a{' '}
          <a href="https://www.uspto.gov/patents/basics/apply/provisional-application" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
            provisional application
          </a>{' '}
          reserves your spot in the queue for $65–$325.
        </li>
        <li>
          File the real thing at{' '}
          <a href="https://patentcenter.uspto.gov" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
            patentcenter.uspto.gov
          </a>
          :
        </li>
      </ol>
      <FeeTable />
      <ol start={4}>
        <li>Average wait for a moderator (patent examiner): about 2 years.</li>
        <li>
          If approved, your post goes live on a Tuesday, appears in our NEW feed within ~86 seconds
          of its slot, and stays up for 20 years (maintenance fees apply: $2,150 / $4,040 / $8,280
          at years 3.5 / 7.5 / 11.5 — stop paying and your post moves to EXPIRING).
        </li>
      </ol>
      <a className="cta" href="https://patentcenter.uspto.gov" target="_blank" rel="noreferrer">
        start a post ($400+, 25-month review) →
      </a>
      <p className="fine">
        Real talk: ~60% of applications eventually become patents. Attorney costs typically
        $8,000–$15,000 for a utility filing. Verify current fees at{' '}
        <a href="https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
          uspto.gov
        </a>
        . This is not legal advice.
      </p>
    </Modal>
  );
}
