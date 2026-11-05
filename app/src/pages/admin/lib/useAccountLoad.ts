import { useEffect, useState } from "react";
import { auth } from "../../../lib/firebase";

export type AccountLoad<T> = { kind: "loading" } | { kind: "ready"; data: T } | { kind: "error"; message: string };

/** Optional retention is confined to the admin directory's shared read model. */
export interface AccountRetention<T> {
  peek(): { data: T } | undefined;
  load(loader: () => Promise<T>): Promise<T>;
  version(): number;
  invalidate(): void;
  subscribe(listener: () => void): () => void;
}

/** Every selection, retry and Auth change invalidates the previous response. */
export function useAccountLoad<T>(loader: () => Promise<T>, retention?: AccountRetention<T>) {
  const [result, setResult] = useState<{ loader: () => Promise<T>; revision: number; uid: string | null; retainedVersion: number; retention?: AccountRetention<T>; state: AccountLoad<T> } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let generation = 0;
    const unsubscribe = retention?.subscribe(() => setRevision(value => value + 1));
    const stop = auth.onAuthStateChanged(user => {
      const request = ++generation;
      const retainedVersion = retention?.version() || 0;
      const publish = (state: AccountLoad<T>) => setResult({ loader, revision, uid: user?.uid || null, retainedVersion, retention, state });
      const cached = user ? retention?.peek() : undefined;
      publish(cached ? { kind: "ready", data: cached.data } : { kind: "loading" });
      if (!user || cached) return;
      const uid = user.uid;
      const current = () => request === generation && auth.currentUser?.uid === uid && retainedVersion === (retention?.version() || 0);
      (retention ? retention.load(loader) : loader()).then(data => { if (current()) publish({ kind: "ready", data }); })
        .catch(error => { if (current()) publish({ kind: "error", message: error instanceof Error ? error.message : "These accounts could not be loaded." }); });
    });
    return () => { ++generation; stop(); unsubscribe?.(); };
  }, [loader, revision, retention]);
  const cached = auth.currentUser ? retention?.peek() : undefined;
  const state: AccountLoad<T> = result?.retention === retention && result?.loader === loader && result.revision === revision && result.uid === auth.currentUser?.uid && result.retainedVersion === (retention?.version() || 0) ? result.state : cached ? { kind: "ready", data: cached.data } : { kind: "loading" };
  return { state, refresh: () => { if (retention) retention.invalidate(); else setRevision(value => value + 1); } };
}
