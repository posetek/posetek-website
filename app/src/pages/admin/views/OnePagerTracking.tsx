import { useCallback } from "react";
import { cloud } from "../../../lib/firebase";
import { useAccountLoad } from "../lib/useAccountLoad";

const metrics = [
  ["openedAt", "Reports opened"],
  ["workoutsAt", "Workout button clicks"],
  ["testflightAt", "TestFlight clicks"],
] as const;
type Metric = typeof metrics[number][0];
type ReportRow = { id: string; name: string } & Record<Metric, number | null>;
type Cohort = { id: string; startDate: string; endDate: string; total: number };
type Tracking = { state: "pending" | "expired" } | {
  state: "active";
  startAt: number;
  total: number;
  reports: ReportRow[];
};
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
  const loadTracking = useCallback(async () => {
    const { data } = await cloud.httpsCallable("getOnePagerEngagement")({ organizationId, cohortId: cohort.id });
    return data as Tracking;
  }, [organizationId, cohort.id]);
  const { state } = useAccountLoad(loadTracking);
  const tracking = state.kind === "ready" ? state.data : null;
  const total = tracking?.state === "active" ? tracking.total : cohort.total;
  return <>
    <p className="admin-note">{total} sent {total === 1 ? "report" : "reports"}. Each report link counts once per action, including when someone forwards it.</p>
    {state.kind === "loading" && <p role="status">Loading one-pager tracking…</p>}
    {state.kind === "error" && <p className="form-message" role="alert">Could not load this cohort. Use Refresh tracking to retry.</p>}
    {tracking?.state === "pending" && <p role="status">Tracking has yet to start.</p>}
    {tracking?.state === "expired" && <p role="status">The 90-day tracking period has ended.</p>}
    {tracking?.state === "active" && <>
      <p className="admin-note">Tracking started {formatPacific.format(tracking.startAt)} Pacific.</p>
      <section className="workspace-summary one-pager-summary" aria-label="One-pager engagement totals">
        {metrics.map(([field, label]) => <div className="workspace-summary-card" key={field}>
          <span>{label}</span><strong>{tracking.reports.filter(row => row[field] !== null).length} of {tracking.total}</strong>
        </div>)}
      </section>
      <table className="directory-player-table" aria-label="First recorded activity per player report">
        <thead><tr><th scope="col">Player</th><th scope="col">First open</th><th scope="col">First Workout click</th><th scope="col">First TestFlight click</th></tr></thead>
        <tbody>{tracking.reports.map(row => <tr key={row.id}>
          <td data-label="Player"><strong>{row.name}</strong></td>
          {metrics.map(([field, label]) => <td data-label={label} key={field}>{row[field] === null ? "None recorded" : <time dateTime={new Date(row[field]).toISOString()}>{formatPacific.format(row[field])}</time>}</td>)}
        </tr>)}</tbody>
      </table>
    </>}
  </>;
}
