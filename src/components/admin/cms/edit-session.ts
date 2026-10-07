/** Detached editor state, independent of React and storage. A remote update never
 * becomes the baseline for dirty edits until the operator explicitly reloads it. */
export class CmsEditSession<T> {
  draft: T;
  savedDraft: T | null = null;
  ready = false;
  conflict = false;
  busy = false;
  error: string | null = null;
  errors: Record<string, string> = {};
  private alive = true;
  private loaded = false;
  private readEpoch = 0;
  readonly published: T;
  constructor(published: T) {
    this.published = structuredClone(published);
    this.draft = structuredClone(published);
  }
  get dirty() { return JSON.stringify(this.draft) !== JSON.stringify(this.savedDraft ?? this.published); }
  get active() { return this.alive; }
  activate() { this.alive = true; }
  dispose() { this.alive = false; this.readEpoch++; }
  beginRead() { return ++this.readEpoch; }
  adoptRemote(remote: T | null, epoch: number, reload = false) {
    if (!this.alive || epoch !== this.readEpoch || this.busy) return;
    this.error = null;
    this.ready = true;
    if (this.loaded && this.dirty && !reload) {
      this.conflict = JSON.stringify(remote) !== JSON.stringify(this.savedDraft);
      return;
    }
    this.savedDraft = structuredClone(remote);
    this.draft = structuredClone(remote ?? this.published);
    this.ready = true;
    this.loaded = true;
    this.conflict = false;
    this.errors = {};
  }
  failRead(error: string, epoch: number) {
    if (!this.alive || epoch !== this.readEpoch) return;
    this.error = error;
    this.ready = false;
  }
  update(next: T | ((current: T) => T)) {
    if (!this.ready) return;
    this.draft = typeof next === "function" ? (next as (current: T) => T)(this.draft) : next;
  }
  beginCommand() {
    this.readEpoch++;
    this.busy = true;
    this.error = null;
    return { document: structuredClone(this.draft), expectedDraft: structuredClone(this.savedDraft) };
  }
  committed(after: T | null, discard = false) {
    if (!this.alive) return;
    this.savedDraft = structuredClone(after);
    if (discard) this.draft = structuredClone(this.published);
    this.conflict = false;
    this.errors = {};
  }
  reset() {
    this.draft = structuredClone(this.savedDraft ?? this.published);
    this.errors = {};
  }
}
