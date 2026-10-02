# Repository workflow

- Complete applicable checks, commit requested changes, merge into `master`,
  and push `master` to the configured remote after finishing implementation.
  The owner explicitly requested this workflow on 2026-10-02. Do not force-push
  or overwrite unrelated work, and do not ask again for this standing approval.
- This is an independent Git repository. Keep its commits separate from any
  parent workspace repository.
- Existing `master` pushes affecting site/shared/data files trigger the static
  deployment workflow. Ingestion is scheduled/manual; do not run live ingestion
  merely to test code or rewrite existing datasets as test fixtures.
- Use offline synthetic fixtures for ingestion tests. Honor the active
  no-GPU restriction until the owner explicitly lifts it.
