export interface Route {
  parts: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const separator = raw.indexOf('?');
  const path = separator < 0 ? raw : raw.slice(0, separator);
  const queryStr = separator < 0 ? '' : raw.slice(separator + 1);
  return {
    parts: path.split('/').filter(Boolean).map((part) => {
      try { return decodeURIComponent(part); } catch { return part; }
    }),
    query: new URLSearchParams(queryStr ?? ''),
  };
}
