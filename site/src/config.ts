/**
 * giscus (GitHub Discussions comments) wiring.
 * Fill these in after the GitHub repo exists: enable Discussions, install the
 * giscus app (github.com/apps/giscus), then copy repoId/categoryId from
 * https://giscus.app configurator. Empty repo = comments show a setup note.
 */
export const GISCUS = {
  repo: 'matusfaro/invented',
  repoId: 'R_kgDOTli3EQ',
  // "General" — category creation isn't exposed via the GitHub API; swap to a
  // dedicated "Patents" category (created in the Discussions UI) when it exists.
  category: 'General',
  categoryId: 'DIC_kwDOTli3Ec4DCNAc',
};

export const SITE_NAME = 'invented.';
export const TAGLINE = 'a new patent every 86 seconds. forever.';
