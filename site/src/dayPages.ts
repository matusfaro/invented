export interface DayPageState<T> { files: T[]; loading: boolean; hasMore: boolean; failedDates: string[] }

/** Keeps successful pages across refresh and never marks a failed fetch as loaded. */
export class DayPages<T extends { date: string }> {
  private dates: string[] = [];
  private files = new Map<string, T>();
  private wanted = new Set<string>();
  private failed = new Set<string>();
  private pending = new Map<string, number>();
  private listeners = new Set<() => void>();
  private generation = 0;
  private key = "";
  private current: DayPageState<T> = { files: [], loading: false, hasMore: false, failedDates: [] };
  constructor(private fetchDay: (date: string) => Promise<T | null>, private batchSize = 3) {}
  snapshot = (): DayPageState<T> => this.current;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(): void {
    this.current = {
      files: this.dates.flatMap((date) => this.files.has(date) ? [this.files.get(date)!] : []),
      loading: this.pending.size > 0,
      hasMore: this.dates.some((date) => !this.wanted.has(date)),
      failedDates: this.dates.filter((date) => this.failed.has(date)),
    };
    for (const listener of this.listeners) listener();
  }
  setDates(dates: string[], revision = ""): void {
    const key = JSON.stringify([dates, revision]);
    if (key === this.key) return;
    this.key = key;
    this.generation++;
    this.pending.clear();
    const previous = new Set(this.dates);
    this.dates = [...new Set(dates)];
    for (const date of this.files.keys()) if (!this.dates.includes(date)) this.files.delete(date);
    this.wanted = new Set([...this.wanted].filter((date) => this.dates.includes(date)));
    for (const date of this.dates.slice(0, this.batchSize)) this.wanted.add(date);
    // New deployments can prepend dates without discarding already-loaded history.
    for (const date of this.dates) if (previous.size && !previous.has(date)) this.wanted.add(date);
    this.failed.clear();
    void this.load([...this.wanted]);
  }
  private async load(dates: string[]): Promise<void> {
    const generation = this.generation;
    const selected = dates.filter((date) => !this.pending.has(date));
    for (const date of selected) this.pending.set(date, generation);
    this.publish();
    await Promise.all(selected.map(async (date) => {
      let file: T | null = null;
      try { file = await this.fetchDay(date); } catch { /* retryable fetch failure */ }
      if (generation !== this.generation) return;
      this.pending.delete(date);
      if (file?.date === date) { this.files.set(date, file); this.failed.delete(date); }
      else this.failed.add(date);
      this.publish();
    }));
  }
  loadMore = (): void => {
    const dates = this.dates.filter((date) => !this.wanted.has(date)).slice(0, this.batchSize);
    for (const date of dates) this.wanted.add(date);
    void this.load(dates);
  };
  retry = (): void => { void this.load([...this.failed]); };
  dispose(): void { this.generation++; this.pending.clear(); this.key = ""; }
}
