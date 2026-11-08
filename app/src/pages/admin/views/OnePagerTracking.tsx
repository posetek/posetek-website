import { cloud } from "../../../lib/firebase";
import { ONE_PAGER_ORGANIZATION } from "../lib/adminNavigation";
import { useAccountLoad } from "../lib/useAccountLoad";

const metrics = [
  ["openedAt", "Reports opened"],
  ["workoutsAt", "Workout button clicks"],
  ["testflightAt", "TestFlight clicks"],
] as const;
type Metric = typeof metrics[number][0];
type ReportRow = { id: string; name: string } & Record<Metric, number | null>;
type Tracking = { state: "pending" | "expired" } | {
  state: "active";
  startAt: number;
  total: number;
  reports: ReportRow[];
};
const formatPacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short",
});

async function loadTracking(): Promise<Tracking> {
  const { data } = await cloud.httpsCallable("getOnePagerEngagement")({ organizationId: ONE_PAGER_ORGANIZATION });
  return data as Tracking;
}

export default function OnePagerTracking() {
  const { state, refresh } = useAccountLoad(loadTracking);
  const tracking = state.kind === "ready" ? state.data : null;
  return <section id="workspace-report-panel-one-pagers" role="tabpanel" aria-labelledby="workspace-report-tab-one-pagers" tabIndex={0}>
    <div className="directory-view-toolbar">
      <div><h3>November 4–5, 2026 one-pagers</h3><p className="admin-note">33 sent reports. Each report link counts once per action, including when someone forwards it.</p></div>
      <button type="button" className="quiet-button" disabled={state.kind === "loading"} onClick={refresh}>Refresh tracking</button>
    </div>
    {state.kind === "loading" && <p role="status">Loading one-pager tracking…</p>}
    {state.kind === "error" && <p className="form-message" role="alert">Could not load one-pager tracking. Use Refresh tracking to retry.</p>}
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
  </section>;
}
