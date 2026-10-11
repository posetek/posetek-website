import { useEffect, useState } from 'react';
import { auth } from './firebase';
import { completeReport, retryableReportError } from '../pages/insights/lib/completeReport';

export type ReadOnlyReport<T> =
  | { kind: 'loading'; data: null; refreshing: boolean; stale: false; message: string; checkedAt: null }
  | { kind: 'error'; data: null; refreshing: false; stale: false; message: string; checkedAt: null }
  | { kind: 'ready'; data: T; refreshing: boolean; stale: boolean; message: string; checkedAt: number };
const empty = (): ReadOnlyReport<never> => ({ kind: 'loading', data: null, refreshing: true, stale: false, message: '', checkedAt: null });
type Reader<T> = (current: () => boolean, onRebuild: () => void) => Promise<T | null>;

/** Retain only this same account/scope's successful read, and only on transient
 * failure. Permissions, transfers, schema failures and late responses clear it. */
export function createReadOnlyReport<T>(now = Date.now) {
  let generation = 0, identity = '', last: Extract<ReadOnlyReport<T>, { kind: 'ready' }> | null = null;
  return {
    cancel() { ++generation; },
    async load(uid: string | null, key: string, read: Reader<T>, publish: (state: ReadOnlyReport<T>) => void, retry = false) {
      const request = ++generation, next = uid && key ? JSON.stringify([uid, key]) : '';
      if (!next || next !== identity) { identity = next; last = null; }
      const current = () => request === generation && identity === next;
      publish(last ? { ...last, refreshing: true, message: '' } : empty());
      if (!next) return;
      try {
        const rebuild = () => { if (current()) publish(last ? { ...last, refreshing: true, message: 'Refreshing complete report…' } : { ...empty(), message: 'Refreshing complete report…' }); };
        const data = retry ? await completeReport(() => read(current, rebuild), current, rebuild) : await read(current, rebuild);
        if (!current() || data === null) return;
        last = { kind: 'ready', data, checkedAt: now(), refreshing: false, stale: false, message: '' };
        publish(last);
      } catch (error) {
        if (!current()) return;
        const message = error instanceof Error ? error.message : 'The report could not be refreshed.';
        if (last && retryableReportError(error)) publish({ ...last, stale: true, refreshing: false, message });
        else { last = null; publish({ kind: 'error', data: null, checkedAt: null, refreshing: false, stale: false, message }); }
      }
    },
  };
}

export function useReadOnlyReport<T>({ key, read, revision = 0, retry = false }: { key: string; read: Reader<T>; revision?: number; retry?: boolean }) {
  const [controller] = useState(() => createReadOnlyReport<T>());
  const [result, setResult] = useState<{ key: string; uid: string | null; revision: number; state: ReadOnlyReport<T> } | null>(null);
  useEffect(() => {
    const handler = controller;
    const stop = auth.onAuthStateChanged(user => {
      const uid = user?.uid || null;
      void handler.load(uid, key, read, state => setResult({ key, uid, revision, state }), retry);
    });
    return () => { handler.cancel(); stop(); };
  }, [key, read, revision, retry, controller]);
  if (result?.key !== key || result?.uid !== (auth.currentUser?.uid || null)) return empty() as ReadOnlyReport<T>;
  return result.revision === revision ? result.state : result.state.kind === 'ready' ? { ...result.state, refreshing: true } : empty() as ReadOnlyReport<T>;
}
