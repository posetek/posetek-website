import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../../../lib/firebase";
import { clubCall, subscribeClubContextInvalidation } from "../../../lib/organization-data";
import { useReadOnlyReport } from '../../../lib/useReadOnlyReport';
import { useForegroundReport } from '../../../lib/foreground-report';
import type { ExpandedInsights, InsightScope } from "../../insights/lib/expanded";
import { createWorkspaceMetricsTransport, workspaceMetricsPayload, workspacePayloadKey } from "./workspaceMetricsData";
import type { WorkspaceReportPayload } from "./workspaceMetricsData";

const transport = createWorkspaceMetricsTransport(payload => clubCall<ExpandedInsights>("getClubInsightsV2", payload));
export interface WorkspaceMetricsInput { scope: InsightScope | null; search: string; playerIds?: string[]; enabled?: boolean; refreshKey?: number; foreground?: boolean }

export function useWorkspaceMetrics({ scope, search, playerIds, enabled = true, refreshKey = 0, foreground = true }: WorkspaceMetricsInput) {
  const key = workspacePayloadKey(enabled && scope ? workspaceMetricsPayload(search, scope, playerIds) : null);
  const payload = useMemo(() => key ? JSON.parse(key) as WorkspaceReportPayload : null, [key]);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const stop = subscribeClubContextInvalidation(() => { transport.clear(); setRevision(value => value + 1); });
    return stop;
  }, []);
  const reader = useCallback(async (current: () => boolean, onRebuild: () => void) => {
    const uid = auth.currentUser?.uid;
    return payload && uid ? transport.load(uid, payload, () => current() && auth.currentUser?.uid === uid, onRebuild) : null;
  }, [payload]);
  const outcome = useReadOnlyReport({ key, read: reader, revision: revision + refreshKey });
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
