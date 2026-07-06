import { useEffect, useRef } from 'react';
import { GISCUS } from '../config';

/**
 * giscus embed, mapped by patent number (`data-mapping="specific"` + term) so
 * discussions survive URL/domain changes. Unconfigured until the GitHub repo
 * exists with Discussions enabled — renders a setup note meanwhile.
 */
export function Giscus({ term }: { term: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GISCUS.repo || !ref.current) return;
    ref.current.innerHTML = '';
    const s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    Object.entries({
      'data-repo': GISCUS.repo,
      'data-repo-id': GISCUS.repoId,
      'data-category': GISCUS.category,
      'data-category-id': GISCUS.categoryId,
      'data-mapping': 'specific',
      'data-term': term,
      'data-strict': '1',
      'data-reactions-enabled': '1',
      'data-input-position': 'top',
      'data-theme': 'dark_dimmed',
      'data-lang': 'en',
    }).forEach(([k, v]) => s.setAttribute(k, v));
    ref.current.appendChild(s);
  }, [term]);

  if (!GISCUS.repo)
    return (
      <p className="section-note">
        💬 comments arrive once the repo goes public (giscus not configured yet)
      </p>
    );
  return <div ref={ref} />;
}
