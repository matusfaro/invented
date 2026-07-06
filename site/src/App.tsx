import { createContext, useContext, useState } from 'react';
import type { PatentItem } from '../../shared/types';
import { SITE_NAME, TAGLINE } from './config';
import { useManifest } from './feedData';
import { hrefFor, useRoute } from './router';
import { FeedNew } from './components/FeedNew';
import { FeedTrending } from './components/FeedTrending';
import { FeedExpiring } from './components/FeedExpiring';
import { FeedTop } from './components/FeedTop';
import { PatentDetail } from './components/PatentDetail';
import { EntityPage } from './components/EntityPage';
import { CreateModal, UpvoteModal } from './components/Modals';
import type { Manifest } from '../../shared/types';

interface ModalApi {
  openUpvote: (patent?: PatentItem | { id: string }) => void;
  openCreate: () => void;
}
const ModalContext = createContext<ModalApi>({ openUpvote: () => {}, openCreate: () => {} });
export const useModals = () => useContext(ModalContext);

const TABS: Array<{ path: string; label: string }> = [
  { path: '/new', label: 'NEW' },
  { path: '/trending', label: 'TRENDING' },
  { path: '/expiring', label: 'EXPIRING' },
  { path: '/top', label: 'TOP' },
];

export function App() {
  const route = useRoute();
  const manifest = useManifest();
  const [upvoteTarget, setUpvoteTarget] = useState<{ id: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const modals: ModalApi = {
    openUpvote: (p) => setUpvoteTarget(p ?? { id: 'X,XXX,XXX' }),
    openCreate: () => setCreateOpen(true),
  };

  const section = route.parts[0] ?? 'new';

  return (
    <ModalContext.Provider value={modals}>
      <div className="shell">
        <header className="header">
          <div className="header-top">
            <a className="logo" href={hrefFor('/new')}>
              {SITE_NAME}
            </a>
            <span className="tagline">{TAGLINE}</span>
          </div>
          <nav className="tabs">
            {TABS.map((t) => (
              <a
                key={t.path}
                className={`tab ${`/${section}` === t.path ? 'active' : ''}`}
                href={hrefFor(t.path)}
              >
                {t.label}
              </a>
            ))}
            <button className="tab" onClick={() => setCreateOpen(true)}>
              + CREATE
            </button>
          </nav>
        </header>

        <Routes route={route} manifest={manifest} />

        {upvoteTarget && (
          <UpvoteModal patentId={upvoteTarget.id} onClose={() => setUpvoteTarget(null)} />
        )}
        {createOpen && <CreateModal onClose={() => setCreateOpen(false)} />}
      </div>
    </ModalContext.Provider>
  );
}

function Routes({ route, manifest }: { route: ReturnType<typeof useRoute>; manifest: Manifest | null }) {
  const [head, a, b] = route.parts;
  switch (head) {
    case undefined:
    case 'new':
      return <FeedNew manifest={manifest} query={route.query} />;
    case 'trending':
      return <FeedTrending manifest={manifest} />;
    case 'expiring':
      return <FeedExpiring manifest={manifest} />;
    case 'top':
      return <FeedTop manifest={manifest} />;
    case 'patent':
      return a && b ? <PatentDetail date={a} id={b} /> : <FeedNew manifest={manifest} query={route.query} />;
    case 'inventor':
      return <EntityPage kind="inventor" name={a ?? ''} manifest={manifest} />;
    case 'company':
      return <EntityPage kind="company" name={a ?? ''} manifest={manifest} />;
    default:
      return <FeedNew manifest={manifest} query={route.query} />;
  }
}
