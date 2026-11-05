import { inFlightRequests } from "../../../lib/inflightRequests";
import { USAGE_FEATURES } from "../../../lib/insight-usage/clock";
import { completeReport, retryableReportError } from "../../insights/lib/completeReport";
import { expandedRequest } from "../../insights/lib/expandedQuery";
import { assertReportScope, reportPayload } from "../../insights/lib/expanded";
import type { ExpandedInsights, InsightScope } from "../../insights/lib/expanded";
import { adminActivitySelection } from "./adminActivity";
import type { AdminActivityReportData, AdminActivityRequest } from "./adminActivity";

export type WorkspaceReportPayload = ReturnType<typeof reportPayload> & {
  rosterPlayerIds?: string[]; adminReporting?: AdminActivityRequest; includeLastFeatureEvidence?: true; includeTestingAnalytics?: true;
};
export type WorkspaceReportReader = (payload: WorkspaceReportPayload) => Promise<ExpandedInsights>;
const invalid = (message: string) => Object.assign(new Error(message), { code: "failed-precondition" });

export function workspaceMetricsPayload(search: string, scope: InsightScope, playerIds?: string[], now = new Date(), adminReporting = false, includeLastFeatureEvidence = false, includeTestingAnalytics = false): WorkspaceReportPayload {
  const request = expandedRequest(search, now);
  const ids = playerIds?.length ? [...playerIds].sort() : undefined;
  if (ids && (ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !id || id.includes("/")))) {
    throw invalid("The visible players changed. Refresh the roster before loading metrics.");
  }
  return { ...reportPayload(request, scope, request.cursor), pageSize: 20, ...(ids ? { rosterPlayerIds: ids } : {}),
    ...(adminReporting ? { adminReporting: adminActivitySelection(request.view, request.adminFollowUp, request.adminSort) } : {}),
    ...(adminReporting && includeTestingAnalytics && request.view === "testing" ? { includeTestingAnalytics: true } : {}),
    ...(adminReporting && includeLastFeatureEvidence && request.view === "usage" ? { includeLastFeatureEvidence: true } : {}) };
}

/** Keyed only by server-visible inputs, so changing the presentation tab reuses data. */
export function workspacePayloadKey(payload: WorkspaceReportPayload | null) { return payload ? JSON.stringify(payload) : ""; }
export function requestFromWorkspacePayload(payload: WorkspaceReportPayload) {
  return { ...expandedRequest(""), timezone: payload.timeZone, startDate: payload.startDate, endDate: payload.endDate,
    testingWindow: payload.testingMode, rosterSearch: payload.nameSearch || "", cursor: payload.cursor || "",
    division: "", ageBand: "", testingStatus: "", workoutStatus: "", usageStatus: "", usagePlatform: "", usageFeature: "", teamAssignment: "", ...payload.filters };
}
export function assertWorkspaceMetrics(data: ExpandedInsights, payload: WorkspaceReportPayload) {
  assertReportScope(data, payload.scope, requestFromWorkspacePayload(payload));
  if (data.scope.access !== "admin") throw Object.assign(new Error("Admin access changed."), { code: "permission-denied" });
  assertAdminActivity(data, payload);
  const requested = payload.rosterPlayerIds;
  if (!requested) return;
  const metrics = data.rosterMetrics;
  if (!Array.isArray(metrics) || metrics.length !== requested.length || new Set(metrics.map(row => row.playerId)).size !== requested.length) {
    throw invalid("The reporting service has not returned metrics for this roster. Refresh and retry.");
  }
  for (const metric of metrics) {
    if (!requested.includes(metric.playerId) || !["included", "excluded"].includes(metric.status)) throw invalid("The roster metrics no longer match this selection.");
    if (metric.status === "included") {
      const player = metric.player;
      const scope = payload.scope;
      if (!player || player.id !== metric.playerId
        || (scope.kind === "organization" || scope.kind === "team") && player.organizationId !== scope.organizationId
        || scope.kind === "team" && player.teamId !== scope.teamId) throw invalid("A player's organization or team changed. Refresh the roster.");
    } else if ("player" in metric) throw invalid("Excluded reporting evidence must not be returned.");
  }
}

/** A legacy reader may omit the additive section; callers show unavailable,
 * never invented zeroes. Present extensions must match the exact request. */
export function assertAdminActivity(data: ExpandedInsights, payload: WorkspaceReportPayload) {
  const report = data.adminReporting, requested = payload.adminReporting;
  if (!report) return;
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const minutes = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const stamp = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!requested || report.version !== 1 || report.followUp !== requested.followUp || report.sort !== requested.sort
    || !stamp(report.asOfMillis) || report.asOfMillis === null || report.population !== data.roster.filtered
    || !report.summary || ![report.summary.noSignIn, report.summary.noActivity, report.summary.unfinishedAssigned, report.summary.noCompletion, report.summary.signInUnknown, report.summary.usageNotCollected].every(value => count(value) && value <= report.population)
    || !Array.isArray(report.topActivePlayers) || !Array.isArray(report.topWorkoutPlayers) || !Array.isArray(report.teams)) throw invalid("Activity reporting no longer matches this selection. Refresh reporting.");
  for (const row of report.topActivePlayers) if (!row.id || typeof row.name !== "string" || !minutes(row.activeMinutes)) throw invalid("Activity rankings are unavailable.");
  for (const row of report.topWorkoutPlayers) if (!row.id || typeof row.name !== "string" || !minutes(row.timerMinutes)) throw invalid("Workout rankings are unavailable.");
  const scope = payload.scope;
  for (const row of report.teams) {
    if (!row.organizationId || !count(row.players) || ![row.collectedPlayers, row.activePlayers, row.signInRecordedPlayers, row.signInNonePlayers, row.signInUnlinkedPlayers, row.signInUnknownPlayers].every(value => count(value) && value <= row.players)
      || ![row.activeMinutes, row.timerMinutes, row.estimatedMinutes].every(minutes)
      || ![row.workoutStarted, row.workoutCompleted, row.timerRecords, row.estimatedRecords].every(count)
      || (scope.kind === "organization" || scope.kind === "team") && row.organizationId !== scope.organizationId
      || scope.kind === "team" && row.teamId !== scope.teamId) throw invalid("Team activity no longer matches this scope.");
  }
  for (const player of data.players) {
    const row = player.adminReporting;
    if (!row || (scope.kind === "organization" || scope.kind === "team") && player.organizationId !== scope.organizationId
      || scope.kind === "team" && player.teamId !== scope.teamId
      || !row.signIn || !["recorded", "none", "unlinked", "unknown"].includes(row.signIn.status) || !stamp(row.signIn.lastSignInAtMillis)
      || (row.signIn.status === "recorded") !== (row.signIn.lastSignInAtMillis !== null)
      || !row.usage || !row.workouts || !row.assigned || !["available", "noActivePlan", "unavailable"].includes(row.assigned.status)) throw invalid("Player activity is incomplete. Refresh reporting.");
    const window = row.usage.lastActivityWindow;
    if (window && (!stamp(window.startMillis) || !stamp(window.endMillis) || window.endMillis <= window.startMillis || window.endMillis - window.startMillis > 15 * 60_000)) throw invalid("Recorded activity timing is unavailable.");
    if (window && Object.hasOwn(window, "featureEvidence")) {
      const evidence = window.featureEvidence;
      if (!evidence || !["latestInterval", "window"].includes(evidence.basis) || !Array.isArray(evidence.features)
        || evidence.features.length < 1 || evidence.features.length > USAGE_FEATURES.length
        || new Set(evidence.features).size !== evidence.features.length
        || !Array.from(evidence.features).every(feature => USAGE_FEATURES.includes(feature))) {
        throw invalid("Recorded feature evidence is unavailable. Refresh reporting.");
      }
    }
    if (row.assigned.status === "available" && ![row.assigned.remaining, row.assigned.notStarted, row.assigned.noEnding].every(count)) throw invalid("Assignment coverage is unavailable.");
    const latest = row.workouts.latest;
    if (latest && (!["workoutLogs", "personalWorkoutLogs"].includes(latest.source) || !latest.logId || !stamp(latest.startedAtMillis) || !stamp(latest.endedAtMillis)
      || latest.timerMinutes !== null && !minutes(latest.timerMinutes) || latest.estimatedMinutes !== null && !minutes(latest.estimatedMinutes))) throw invalid("Latest workout evidence is unavailable.");
  }
}

export const WORKSPACE_REPORT_TTL_MS = 60_000;
export const WORKSPACE_REPORT_MAX_ENTRIES = 5;
export const WORKSPACE_REPORT_MAX_BYTES = 2 * 1024 * 1024;
export interface WorkspaceReportObservation { data: ExpandedInsights; checkedAt: number }
/** Aggregate evidence only: never a substitute for requested player ordering or detail. */
export type WorkspaceSummaryData = Omit<ExpandedInsights, 'players' | 'pagination' | 'rosterMetrics' | 'nameSearch' | 'roster' | 'adminReporting'> & {
  roster: Omit<ExpandedInsights['roster'], 'matched'>;
  adminReporting?: Omit<AdminActivityReportData, 'sort' | 'followUp'>;
};
export interface WorkspaceSummaryObservation { data: WorkspaceSummaryData; checkedAt: number; stale: boolean }
export function workspaceSummaryKey(payload: WorkspaceReportPayload) {
  if (!payload.adminReporting) return '';
  return JSON.stringify([payload.scope, payload.timeZone, payload.startDate, payload.endDate, payload.testingMode,
    Object.entries(payload.filters).sort(([a], [b]) => a.localeCompare(b))]);
}
function summaryData(data: ExpandedInsights): WorkspaceSummaryData | null {
  if (!data.adminReporting) return null;
  const { players: _players, pagination: _pagination, rosterMetrics: _metrics, nameSearch: _search, roster, adminReporting, ...aggregate } = data;
  const { matched: _matched, ...population } = roster;
  const { sort: _sort, followUp: _followUp, ...activity } = adminReporting;
  return { ...aggregate, roster: population, adminReporting: activity };
}

/** Completed observations live only in this admin workspace's memory. Exact
 * server inputs remain the key: different sorts/pages/detail never masquerade
 * as the selected report. Invalidation also fences every pending response. */
export function createWorkspaceMetricsTransport(read: WorkspaceReportReader, now = Date.now) {
  const requests = inFlightRequests<ExpandedInsights>();
  const completed = new Map<string, WorkspaceReportObservation & { bytes: number; cohortKey: string }>();
  const listeners = new Set<() => void>();
  let summary: { key: string; data: WorkspaceSummaryData; checkedAt: number; bytes: number } | null = null;
  let actor: string | null = null, scopeKey = '', generation = 0, bytes = 0;
  const clear = (silent = false) => {
    ++generation; requests.clear(); completed.clear(); summary = null; bytes = 0;
    if (!silent) listeners.forEach(listener => listener());
  };
  const observeIdentity = (uid: string | null) => { if (actor !== uid) { actor = uid; clear(); } };
  const observeScope = (scope: InsightScope | null) => {
    const next = scope ? JSON.stringify(scope) : '';
    if (scopeKey !== next) { scopeKey = next; clear(); }
  };
  const remove = (key: string) => { const entry = completed.get(key); if (entry) { bytes -= entry.bytes; completed.delete(key); } };
  const prune = () => {
    for (const [key, entry] of completed) if (now() - entry.checkedAt >= WORKSPACE_REPORT_TTL_MS || now() < entry.checkedAt) remove(key);
  };
  const peek = (uid: string | null, payload: WorkspaceReportPayload): WorkspaceReportObservation | null => {
    prune();
    if (!uid || actor !== uid || scopeKey !== JSON.stringify(payload.scope)) return null;
    return completed.get(workspacePayloadKey(payload)) || null;
  };
  const peekSummary = (uid: string | null, payload: WorkspaceReportPayload): WorkspaceSummaryObservation | null => {
    const key = workspaceSummaryKey(payload);
    if (!key || !uid || uid !== actor || scopeKey !== JSON.stringify(payload.scope)) return null;
    // Returning to a fresh exact observation can restore its cohort summary;
    // another cohort's newer snapshot must never occupy that display slot.
    if (summary?.key !== key) {
      const candidate = [...completed.values()].filter(entry => entry.cohortKey === key && now() >= entry.checkedAt && now() - entry.checkedAt < WORKSPACE_REPORT_TTL_MS).sort((a, b) => b.checkedAt - a.checkedAt)[0];
      if (candidate) retainSummary(payload, candidate.data, candidate.checkedAt);
    }
    if (!summary || summary.key !== key) return null;
    if (now() < summary.checkedAt) { bytes -= summary.bytes; summary = null; return null; }
    return { data: summary.data, checkedAt: summary.checkedAt, stale: now() - summary.checkedAt >= WORKSPACE_REPORT_TTL_MS };
  };
  const retainSummary = (payload: WorkspaceReportPayload, data: ExpandedInsights, checkedAt: number) => {
    const key = workspaceSummaryKey(payload), aggregate = key ? summaryData(data) : null;
    if (!aggregate) { if (key && summary) { bytes -= summary.bytes; summary = null; } return; }
    let size: number;
    try { size = new TextEncoder().encode(JSON.stringify(aggregate)).byteLength; } catch { return; }
    if (summary) { bytes -= summary.bytes; summary = null; }
    if (size > WORKSPACE_REPORT_MAX_BYTES) return;
    while (completed.size && bytes + size > WORKSPACE_REPORT_MAX_BYTES) remove(completed.keys().next().value!);
    summary = { key, data: aggregate, checkedAt, bytes: size }; bytes += size;
  };
  return {
    observeIdentity, observeScope, clear, peek, peekSummary,
    getGeneration: () => generation,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load(uid: string, payload: WorkspaceReportPayload, isCurrent: () => boolean, onRebuild?: () => void, validate?: (data: ExpandedInsights) => void, options: { force?: boolean; retain?: boolean } = {}) {
      if (!isCurrent()) return null;
      observeIdentity(uid); if (options.retain) observeScope(payload.scope);
      const start = generation, key = workspacePayloadKey(payload);
      const current = () => isCurrent() && actor === uid && generation === start;
      const cached = options.retain && !options.force && peek(uid, payload);
      if (cached) {
        try { assertWorkspaceMetrics(cached.data, payload); validate?.(cached.data); retainSummary(payload, cached.data, cached.checkedAt); return cached.data; }
        catch (error) {
          remove(key);
          if (!retryableReportError(error)) { clear(true); throw error; }
        }
      }
      // Refresh applies to this whole shared workspace observation. Other tab
      // variants must be read again too; the mounted hook retains its own prior
      // result while refreshing, without notifying or restarting other readers.
      if (options.retain && options.force) { completed.clear(); bytes = summary?.bytes || 0; }
      else if (options.retain) remove(key);
      const data = await completeReport(async () => {
        const result = await requests.run(JSON.stringify([uid, payload]), () => read(payload));
        if (current()) { assertWorkspaceMetrics(result, payload); validate?.(result); }
        return result;
      }, current, onRebuild).catch(error => {
        if (start === generation && !retryableReportError(error)) clear(true);
        throw error;
      });
      if (!data || !current()) return null;
      assertWorkspaceMetrics(data, payload);
      if (!options.retain) return data;
      const checkedAt = now();
      let size: number;
      try { size = new TextEncoder().encode(JSON.stringify(data)).byteLength; }
      catch { return data; } // Cache accounting must never reject a valid report.
      prune(); remove(key);
      retainSummary(payload, data, checkedAt);
      if (options.retain && size + (summary?.bytes || 0) <= WORKSPACE_REPORT_MAX_BYTES) {
        while (completed.size && (completed.size >= WORKSPACE_REPORT_MAX_ENTRIES || bytes + size > WORKSPACE_REPORT_MAX_BYTES)) remove(completed.keys().next().value!);
        completed.set(key, { data, checkedAt, bytes: size, cohortKey: workspaceSummaryKey(payload) }); bytes += size;
      }
      return data;
    },
  };
}
