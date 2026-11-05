import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../../../lib/firebase";
import { clubCall, subscribeClubContextInvalidation } from "../../../lib/organization-data";
import { useReadOnlyReport } from '../../../lib/useReadOnlyReport';
import type { ReadOnlyReport } from '../../../lib/useReadOnlyReport';
import { retryableReportError } from '../../insights/lib/completeReport';
import { useForegroundReport } from '../../../lib/foreground-report';
import type { ExpandedInsights, InsightScope } from "../../insights/lib/expanded";
import { createWorkspaceMetricsTransport, workspaceMetricsPayload, workspacePayloadKey } from "./workspaceMetricsData";
import type { WorkspaceReportPayload } from "./workspaceMetricsData";
import { failDirectorySession } from "./directoryRetention";

const transport = createWorkspaceMetricsTransport(payload => clubCall<ExpandedInsights>("getClubInsightsV2", payload));
let observing = false;
function observeWorkspaceSession() {
  if (observing) return;
  observing = true;
  let initial = true;
  auth.onAuthStateChanged(user => {
    // The observer stays installed while tabs are unmounted. Every later auth
    // lifecycle clears retained reports, including logout/login to the same UID.
    if (!initial) transport.clear();
    initial = false; transport.observeIdentity(user?.uid || null);
  });
  subscribeClubContextInvalidation(() => transport.clear());
}
/** Called by the directory owner, including on Staff/Settings scope transitions. */
export function setWorkspaceMetricsScope(scope: InsightScope | null) { transport.observeScope(scope); }
export interface WorkspaceMetricsInput { scope: InsightScope | null; search: string; playerIds?: string[]; enabled?: boolean; refreshKey?: number; foreground?: boolean; adminReporting?: boolean; includeLastFeatureEvidence?: boolean; validate?: (data: ExpandedInsights) => void; retain?: boolean }
const empty = (): ReadOnlyReport<ExpandedInsights> => ({ kind: 'loading', data: null, refreshing: true, stale: false, message: '', checkedAt: null });
const ready = (data: ExpandedInsights, checkedAt: number): ReadOnlyReport<ExpandedInsights> => ({ kind: 'ready', data, refreshing: false, stale: false, message: '', checkedAt });

/** Admin-only opt-in. The ordinary read-only hook remains authoritative for
 * PlayerSummary/Detail and any caller with a custom freshness validator. */
function useRetainedWorkspaceReport(payload: WorkspaceReportPayload | null, revision: string, enabled: boolean) {
  const key = workspacePayloadKey(payload), uid = auth.currentUser?.uid || null;
  const [invalidated, invalidate] = useState(0);
  const [result, setResult] = useState<{ key: string; uid: string; generation: number; revision: string; state: ReadOnlyReport<ExpandedInsights> } | null>(null);
  const lastSelection = useRef<{ key: string; revision: string } | null>(null);
  useEffect(() => { if (!enabled) return; observeWorkspaceSession(); return transport.subscribe(() => invalidate(value => value + 1)); }, [enabled]);
  useEffect(() => {
    if (!payload || !uid) return;
    let active = true;
    const force = Boolean(lastSelection.current && lastSelection.current.revision !== revision);
    lastSelection.current = { key, revision };
    const cached = !force && transport.peek(uid, payload);
    if (cached) {
      setResult({ key, uid, generation: transport.getGeneration(), revision, state: ready(cached.data, cached.checkedAt) });
      return;
    }
    const generation = transport.getGeneration();
    const current = () => active && auth.currentUser?.uid === uid;
    const publish = (state: ReadOnlyReport<ExpandedInsights>) => { if (current()) setResult({ key, uid, generation: transport.getGeneration(), revision, state }); };
    // Only an already mounted identical selection can survive a refresh failure.
    // Expired observations are never seeded into a newly visited selection.
    const prior = result?.key === key && result.uid === uid && result.generation === generation && result.state.kind === 'ready' ? result.state : null;
    publish(prior ? { ...prior, refreshing: true, message: '' } : empty());
    void transport.load(uid, payload, current, () => publish(prior ? { ...prior, refreshing: true, message: 'Refreshing complete report…' } : { ...empty(), message: 'Refreshing complete report…' }), undefined, { retain: true, force }).then(data => {
      if (data && current()) publish(ready(data, transport.peek(uid, payload)?.checkedAt ?? Date.now()));
    }).catch(error => {
      if (!current()) return;
      const code = String(error?.code || '').split('/').at(-1);
      if (code === 'permission-denied' || code === 'unauthenticated') failDirectorySession(error);
      const message = error instanceof Error ? error.message : 'The report could not be refreshed.';
      publish(prior && retryableReportError(error) ? { ...prior, stale: true, refreshing: false, message } : { kind: 'error', data: null, checkedAt: null, refreshing: false, stale: false, message });
    });
    return () => { active = false; };
    // Result is the previous observation, not a trigger for another network read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uid, revision, invalidated]);
  if (!payload || !uid) return empty();
  if (result?.key === key && result.uid === uid && result.generation === transport.getGeneration()) {
    return result.revision === revision ? result.state : result.state.kind === 'ready' ? { ...result.state, refreshing: true } : empty();
  }
  const cached = transport.peek(uid, payload);
  return cached ? ready(cached.data, cached.checkedAt) : empty();
}

export function useWorkspaceMetrics({ scope, search, playerIds, enabled = true, refreshKey = 0, foreground = true, adminReporting = false, includeLastFeatureEvidence = false, validate, retain = false }: WorkspaceMetricsInput) {
  const key = workspacePayloadKey(enabled && scope ? workspaceMetricsPayload(search, scope, playerIds, new Date(), adminReporting, includeLastFeatureEvidence) : null);
  const payload = useMemo(() => key ? JSON.parse(key) as WorkspaceReportPayload : null, [key]);
  const retained = retain && !validate;
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => subscribeClubContextInvalidation(() => { if (!retained) { transport.clear(); setRevision(value => value + 1); } }), [retained]);
  const reader = useCallback(async (current: () => boolean, onRebuild: () => void) => {
    const uid = auth.currentUser?.uid;
    return !retained && payload && uid ? transport.load(uid, payload, () => current() && auth.currentUser?.uid === uid, onRebuild, validate) : null;
  }, [payload, validate, retained]);
  const ordinaryOutcome = useReadOnlyReport({ key: retained ? '' : key, read: reader, revision: revision + refreshKey });
  const retainedOutcome = useRetainedWorkspaceReport(retained ? payload : null, `${revision}:${refreshKey}`, retained);
  const outcome = retained ? retainedOutcome : ordinaryOutcome;
  const refreshing = Boolean(payload && outcome.refreshing);
  const loading = refreshing && !outcome.data;
  useForegroundReport({ key, refresh, busy: refreshing, enabled: Boolean(payload && foreground) });
  return {
    data: payload ? outcome.data : null,
    error: outcome.kind === 'error' ? outcome.message : '',
    rebuilding: refreshing && outcome.message === 'Refreshing complete report…',
    loading, refreshing, stale: outcome.stale, checkedAt: outcome.checkedAt,
    refresh,
  };
}
