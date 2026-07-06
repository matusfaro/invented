# invented — the patent doom-scroller

Scroll patents reddit-style: **NEW** (a fresh patent every ~86 seconds), **TRENDING**
(patents being cited by this week's new grants, climbing live), **EXPIRING** (into the
public domain today), and **TOP** (all-time most cited, post-MVP).

Upvoting a patent requires citing it in your own patent application (USPTO fees apply).

## How it works — zero backend

- **GitHub Pages** serves the site and static JSON "feeds".
- **GitHub Actions** (weekly cron) downloads the USPTO weekly grant XML (~7,000 patents,
  published every Tuesday), spreads them across the following week with per-patent
  `reveal_ts` timestamps, tallies which older patents this week's grants cite (trending),
  commits the JSON, builds, and deploys.
- **The client** shows only items whose `reveal_ts` has passed and ticks new ones in as
  time passes — the feed is "live" even though everything is static (the original-Wordle
  pattern).

## Layout

- `site/` — Vite + React + TS SPA
- `pipeline/` — Node + TS CLI scripts (all logic; workflows are thin wrappers). Every
  script runs locally: `pnpm --dir pipeline run ingest`.
- `data/` — committed JSON feeds (the "database")
- `.github/workflows/` — thin cron wrappers: fetch → commit → build → deploy

## One-time GitHub setup

1. Create the GitHub repo (public), push `master`, make it the default branch.
2. **USPTO API key** (required for real data): create a USPTO.gov account at
   [data.uspto.gov/myodp](https://data.uspto.gov/myodp) (needs ID.me identity
   verification, one time), generate an API key, save it as the `USPTO_API_KEY`
   Actions secret. Keys idle >90 days are deleted; the weekly cron keeps ours warm.
3. **Pages**: repo Settings → Pages → Source: "GitHub Actions".
4. **Comments**: enable Discussions on the repo, install the
   [giscus app](https://github.com/apps/giscus), create a "Patents" discussion
   category, then fill `site/src/config.ts` from the [giscus.app](https://giscus.app)
   configurator.
5. Kick the first run: Actions → weekly-ingest → Run workflow.
6. (Later, custom domain) point DNS at Pages, set repo variable `BASE_PATH=/`.

## Local dev

```bash
pnpm --dir site install && pnpm --dir site run dev
pnpm --dir pipeline install
pnpm --dir pipeline run ingest -- --dry-run   # fetch + parse latest weekly drop
```
