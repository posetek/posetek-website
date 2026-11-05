import type { OrganizationRow } from "./accounts";
import type { DirectorySource } from "./adminDirectory";
import type { AccountRetention } from "./useAccountLoad";

export const DIRECTORY_FRESHNESS_MS = 60_000;
const MAX_RETAINED_BYTES = 4 * 1024 * 1024;
function canRetain(data: unknown) {
  try { return JSON.stringify(data).length * 2 <= MAX_RETAINED_BYTES; }
  catch { return false; } // A successful canonical read must not fail merely because it cannot be retained.
}

/** One actor/source and one selected organization; nothing is written to browser storage. */
export class DirectorySession {
  private entries = new Map<string, { data?: unknown; expires?: number; pending?: Promise<unknown>; version: number }>();
  private listeners = new Map<string, Set<() => void>>();
  private scopeVersion = 0;
  private organizationsVersion = 0;
  private handles = new Map<string, AccountRetention<unknown>>();
  private organizationId?: string;
  private denial: unknown;
  private source: DirectorySource;
  private invalidateContext: () => void;
  private now: () => number;
  constructor(source: DirectorySource, invalidateContext: () => void, now = Date.now) {
    this.source = source; this.invalidateContext = invalidateContext; this.now = now;
  }

  selectOrganization(id?: string) {
    if (id === this.organizationId) return;
    this.clearScopes(false);
    this.organizationId = id;
    for (const key of this.handles.keys()) if (key !== "organizations") this.handles.delete(key);
  }
  fail(error: unknown) { this.denial = error; this.clear(true, true); }
  clearScopes(notify = true) { this.denial = undefined; this.clear(false, notify); }
  clearAll(notify = true) { this.denial = undefined; this.clear(true, notify); }
  private clear(all: boolean, notify: boolean) {
    ++this.scopeVersion;
    if (all) ++this.organizationsVersion;
    for (const key of new Set([...this.entries.keys(), ...this.handles.keys()])) {
      if (all || key !== "organizations") this.drop(key, notify);
    }
  }
  private drop(key: string, notify: boolean) {
    this.entries.delete(key);
    if (notify) this.listeners.get(key)?.forEach(listener => listener());
  }
  organizations() { return this.entry("organizations", () => this.source.organizations()); }
  context(id: string) { return this.entry(`context:${id}`, () => this.source.context(id)); }
  roster(org: OrganizationRow) {
    let contextExpires = 0;
    return this.entry(`roster:${org.id}`, async () => {
      const version = this.scopeVersion;
      const context = await this.context(org.id).load(() => this.source.context(org.id));
      if (version !== this.scopeVersion) throw new Error("The organization selection changed. Retry the current scope.");
      contextExpires = this.entries.get(`context:${org.id}`)?.expires || 0;
      return this.source.roster(org, context);
    }, () => contextExpires);
  }
  private entry<T>(key: string, read: () => Promise<T>, dependencyExpiry?: () => number): AccountRetention<T> {
    const previous = this.handles.get(key);
    if (previous) return previous as AccountRetention<T>;
    const current = () => key === "organizations" ? this.organizationsVersion : this.scopeVersion;
    const selected = () => key === "organizations" || key.slice(key.indexOf(":") + 1) === this.organizationId;
    const handle: AccountRetention<T> = {
      version: current,
      peek: () => {
        const entry = this.entries.get(key);
        return selected() && entry && entry.data !== undefined && entry.expires! > this.now() ? { data: entry.data as T } : undefined;
      },
      load: () => {
        if (this.denial !== undefined) return Promise.reject(this.denial);
        if (!selected()) return Promise.reject(new Error("The organization selection changed. Retry the current scope."));
        const fresh = handle.peek();
        if (fresh) return Promise.resolve(fresh.data);
        const previous = this.entries.get(key);
        if (previous?.pending) return previous.pending as Promise<T>;
        const version = current();
        const entry: { data?: T; expires?: number; pending?: Promise<T>; version: number } = { version };
        const pending = Promise.resolve().then(() => {
          if (current() !== version) throw new Error("The directory session changed. Retry the current scope.");
          return read();
        }).then(data => {
          if (current() === version && this.entries.get(key) === entry) {
            // A single canonical roster is bounded by the service; also bound retained bytes.
            if (canRetain(data)) {
              entry.data = data; entry.expires = Math.min(this.now() + DIRECTORY_FRESHNESS_MS, dependencyExpiry?.() ?? Infinity); delete entry.pending;
            } else this.entries.delete(key);
          }
          return data;
        }, error => {
          if (current() === version && this.entries.get(key) === entry) {
            this.entries.delete(key);
            const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
            const message = error instanceof Error ? error.message : String(error);
            if (/permission|unauthenticated|access.*required|access.*denied|not.authorized/i.test(`${code} ${message}`)) {
              // Fail closed once, without making each invalidated subscriber retry the denied backend.
              this.fail(error);
            }
          }
          throw error;
        });
        entry.pending = pending; this.entries.set(key, entry);
        return pending;
      },
      invalidate: () => {
        // Clear the canonical callable's in-flight deduper as well as our retained observation.
        this.invalidateContext();
        if (key === "organizations") { ++this.organizationsVersion; this.drop(key, true); }
      },
      subscribe: listener => {
        let listeners = this.listeners.get(key);
        if (!listeners) { listeners = new Set(); this.listeners.set(key, listeners); }
        listeners.add(listener);
        return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(key); };
      },
    };
    this.handles.set(key, handle as AccountRetention<unknown>);
    return handle;
  }
}
