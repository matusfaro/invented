import { useEffect, useState } from 'react';

/**
 * Minimal hash router. Hash routing (not history routing) is deliberate:
 * GitHub Pages has no rewrite rules, so deep links under history routing would
 * 404 without the 404.html hack. `#/patent/2026-07-09/12345678` always works.
 */
export interface Route {
  parts: string[];
  query: URLSearchParams;
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, queryStr] = raw.split('?');
  return {
    parts: path.split('/').filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(queryStr ?? ''),
  };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('/') ? path : `/${path}`;
}

export function hrefFor(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}
