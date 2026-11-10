import { useCallback, useMemo } from "react";
import { cloud } from "../../../lib/firebase";
import { ONE_PAGER_METRICS, formatViewTime, onePagerTrend, viewTimeSummary } from "../lib/onePagerTrend";
import type { OnePagerReport } from "../lib/onePagerTrend";
import { useAccountLoad } from "../lib/useAccountLoad";
import OnePagerTrendChart from "./OnePagerTrendChart";

type Cohort = { id: string; startDate: string; endDate: string; total: number };
type Response = { state: "pending" | "expired" } | {
  state: "active";
  startAt: number;
  total: number;
  reports: OnePagerReport[];
};
/** `loadedAt` is when this browser received the response; the right edge of the chart.
 * `accountsReported` is false for a tracking service that does not report account creation yet. */
type Tracking = Response & { loadedAt: number; accountsReported: boolean };
const formatPacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short",
});
const formatCohort = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", year: "numeric", month: "long", day: "numeric",
});

function cohortLabel({ startDate, endDate }: Cohort) {
  return formatCohort.formatRange(new Date(startDate), new Date(endDate));
}

export default function OnePagerTracking({ organizationId, cohortId, onCohortChange }: {
  organizationId: string; cohortId?: string; onCohortChange(id: string): void;
}) {
  const loadCohorts = useCallback(async () => {
    const { data } = await cloud.httpsCallable("getOnePagerEngagement")({ organizationId, view: "cohorts" });
    return (data as { cohorts: Cohort[] }).cohorts;
  }, [organizationId]);
  const { state, refresh } = useAccountLoad(loadCohorts);
  const cohorts = state.kind === "ready" ? state.data : [];
  const cohort = cohortId ? cohorts.find(row => row.id === cohortId) : cohorts[0];
  return <section id="workspace-report-panel-one-pagers" role="tabpanel" aria-labelledby="workspace-report-tab-one-pagers" tabIndex={0}>
    <div className="directory-view-toolbar">
      <div><h3>One-pager engagement</h3>
        {cohorts.length > 0 && <label className="directory-search directory-team-filter">
          <span>Cohort</span>
          <select value={cohort?.id ?? ""} onChange={event => onCohortChange(event.target.value)}>
            {!cohort && <option value="" disabled>Choose a cohort</option>}
            {cohorts.map(row => <option key={row.id} value={row.id}>{cohortLabel(row)}</option>)}
          </select>
        </label>}
      </div>
      <button type="button" className="quiet-button" disabled={state.kind === "loading"} onClick={refresh}>Refresh tracking</button>
    </div>
    {state.kind === "loading" && <p role="status">Loading cohorts…</p>}
    {state.kind === "error" && <p className="form-message" role="alert">Could not load one-pager tracking. Use Refresh tracking to retry.</p>}
    {state.kind === "ready" && !cohort && <p role="status">{cohortId ? "This cohort is unavailable in the selected organization." : "No sent one-pager cohorts for this organization yet."}</p>}
    {cohort && <CohortTracking organizationId={organizationId} cohort={cohort} />}
  </section>;
}

function CohortTracking({ organizationId, cohort }: { organizationId: string; cohort: Cohort }) {
  const loadTracking = useCallback(async (): Promise<Tracking> => {
    const { data } = await cloud.httpsCallable("getOnePagerEngagement")({ organizationId, cohortId: cohort.id });
    const response = data as Response;
    if (response.state !== "active") return { ...response, loadedAt: Date.now(), accountsReported: false };
    // Absent on an earlier service: read as "none" for counting, and shown as not available.
    const accountsReported = response.reports.some(row => (row as { accountAt?: unknown }).accountAt !== undefined);
    return { ...response, reports: response.reports.map(row => ({ ...row, accountAt: typeof row.accountAt === "number" ? row.accountAt : null })), loadedAt: Date.now(), accountsReported };
  }, [organizationId, cohort.id]);
  const { state } = useAccountLoad(loadTracking);
  const tracking = state.kind === "ready" ? state.data : null;
  const active = tracking?.state === "active" ? tracking : null;
  const total = active ? active.total : cohort.total;
  const viewTime = active ? viewTimeSummary(active.reports) : null;
  const hadAccount = active ? active.reports.filter(row => row.hadAccount === true).length : 0;
  const hasActivity = active?.reports.some(row => ONE_PAGER_METRICS.some(({ field }) => row[field] !== null));
  const trend = useMemo(() => active && hasActivity ? onePagerTrend(active.reports, active.total, active.startAt, active.loadedAt) : null, [active, hasActivity]);
  return <>
    <p className="admin-note">{total} sent {total === 1 ? "report" : "reports"}. Each report link counts once per action, including when someone forwards it.</p>
    {state.kind === "loading" && <p role="status">Loading one-pager tracking…</p>}
    {state.kind === "error" && <p className="form-message" role="alert">Could not load this cohort. Use Refresh tracking to retry.</p>}
    {tracking?.state === "pending" && <p role="status">Tracking has yet to start.</p>}
    {tracking?.state === "expired" && <p role="status">The 90-day tracking period has ended.</p>}
    {active && <>
      <p className="admin-note">Tracking started {formatPacific.format(active.startAt)} Pacific.</p>
      <section className="workspace-summary one-pager-summary" aria-label="One-pager engagement totals">
        <div className="workspace-summary-card"><span>Reports sent</span><strong>{active.total}</strong></div>
        {ONE_PAGER_METRICS.map(({ field, label }) => <div className="workspace-summary-card" key={field}>
          <span>{label}</span>
          {field === "accountAt" && !active.accountsReported ? <><strong>Not available</strong><p>Account creation is not being reported yet.</p></>
            : <strong>{active.reports.filter(row => row[field] !== null).length} of {active.total}</strong>}
          {field === "accountAt" && active.accountsReported && <p>Claimed since the first send date{hadAccount ? ` · ${hadAccount} already had an account` : ""}</p>}
        </div>)}
        <div className="workspace-summary-card"><span>Average time on page</span>
          {viewTime === null ? <><strong>Not available</strong><p>Time on page is not being collected yet.</p></>
            : viewTime.reports ? <><strong>{formatViewTime(viewTime.averageSeconds)}</strong><p>Per report, all visits combined · {viewTime.reports} {viewTime.reports === 1 ? "report" : "reports"} with recorded time · {formatViewTime(viewTime.totalSeconds)} in total</p></>
              : <><strong>None recorded</strong><p>Counts from when time tracking was published.</p></>}
        </div>
      </section>
      {trend ? <OnePagerTrendChart points={trend} omit={active.accountsReported ? undefined : "accountAt"} />
        : <p className="admin-note">No opens or clicks recorded yet. A chart of activity over time appears after the first one.</p>}
      <table className="directory-player-table one-pager-table" aria-label="First recorded activity per player report">
        <thead><tr><th scope="col">Player</th><th scope="col">First open</th><th scope="col">First Workout click</th><th scope="col">Account created</th><th scope="col">First TestFlight click</th><th scope="col">Time on page</th></tr></thead>
        <tbody>{active.reports.map(row => <tr key={row.id}>
          <td data-label="Player"><strong>{row.name}</strong></td>
          {ONE_PAGER_METRICS.map(({ field, label }) => <td data-label={label} key={field}>{row[field] === null ? (field !== "accountAt" ? "None recorded" : !active.accountsReported ? "Not available" : row.hadAccount ? "Already had an account" : "Not yet") : <time dateTime={new Date(row[field]).toISOString()}>{formatPacific.format(row[field])}</time>}</td>)}
          <td data-label="Time on page">{typeof row.viewSeconds !== "number" ? "Not available" : row.viewSeconds > 0 ? formatViewTime(row.viewSeconds) : "None recorded"}</td>
        </tr>)}</tbody>
      </table>
      <p className="admin-note">Time on page is an estimate. It counts while the report is the visible tab, for up to two minutes after it is opened or last touched, and two people reading the same link at once count once.</p>
    </>}
  </>;
}
