import type { PatentItem } from '../../../shared/types';
import { INDUSTRY_FILTERS } from '../cpc';
import type { Filters } from '../feedData';
import { filtersToQuery } from '../feedData';
import { hrefFor } from '../router';

export function FilterBar({
  filters,
  basePath,
  items,
}: {
  filters: Filters;
  basePath: string;
  items: PatentItem[];
}) {
  const active = filters.industry || filters.company || filters.inventor;
  // Only offer industries actually present in the loaded window to avoid dead chips.
  const present = new Set(items.map((i) => i.cpc[0]?.[0]).filter(Boolean));
  return (
    <div className="filterbar">
      {INDUSTRY_FILTERS.filter((f) => present.has(f.section) || filters.industry === f.section).map(
        (f) => {
          const on = filters.industry === f.section;
          const next = { ...filters, industry: on ? undefined : f.section };
          return (
            <a key={f.section} className={`chip ${on ? 'on' : ''}`} href={hrefFor(`${basePath}${filtersToQuery(next)}`)}>
              {f.label}
            </a>
          );
        },
      )}
      {filters.company && (
        <a className="chip on" href={hrefFor(`${basePath}${filtersToQuery({ ...filters, company: undefined })}`)}>
          🏢 {filters.company} ✕
        </a>
      )}
      {filters.inventor && (
        <a className="chip on" href={hrefFor(`${basePath}${filtersToQuery({ ...filters, inventor: undefined })}`)}>
          👤 {filters.inventor} ✕
        </a>
      )}
      {active && (
        <a className="clear" href={hrefFor(basePath)}>
          clear
        </a>
      )}
    </div>
  );
}
