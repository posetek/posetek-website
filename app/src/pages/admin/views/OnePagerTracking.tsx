import { useMemo } from "react";
import { cloud } from "../../../lib/firebase";
import { ONE_PAGER_ORGANIZATION } from "../lib/adminNavigation";
import { ONE_PAGER_METRICS, formatViewTime, onePagerTrend, viewTimeSummary } from "../lib/onePagerTrend";
import type { OnePagerReport } from "../lib/onePagerTrend";
import { useAccountLoad } from "../lib/useAccountLoad";
import OnePagerTrendChart from "./OnePagerTrendChart";

type Response = { state: "pending" | "expired" } | {
  state: "active";
  startAt: number;
  total: number;
  reports: OnePagerReport[];
};
/** `loadedAt` is when this browser received the response; the right edge of the chart. */
type Tracking = Response & { loadedAt: number };
const formatPacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short",
});

async function loadTracking(): Promise<Tracking> {
  const { data } = await cloud.httpsCallable("getOnePagerEngagement")({ organizationId: ONE_PAGER_ORGANIZATION });
  return { ...(data as Response), loadedAt: Date.now() };
}

export default function OnePagerTracking() {
  const { state, refresh } = useAccountLoad(loadTracking);
  const tracking = state.kind === "ready" ? state.data : null;
  const active = tracking?.state === "active" ? tracking : null;
  const viewTime = active ? viewTimeSummary(active.reports) : null;
  const hasActivity = active?.reports.some(row => ONE_PAGER_METRICS.some(({ field }) => row[field] !== null));
  const trend = useMemo(() => active && hasActivity ? onePagerTrend(active.reports, active.total, active.startAt, active.loadedAt) : null, [active, hasActivity]);
  return <section id="workspace-report-panel-one-pagers" role="tabpanel" aria-labelledby="workspace-report-tab-one-pagers" tabIndex={0}>
    <div className="directory-view-toolbar">
      <div><h3>November 4–5, 2026 one-pagers</h3><p className="admin-note">33 sent reports. Each report link counts once per action, including when someone forwards it.</p></div>
      <button type="button" className="quiet-button" disabled={state.kind === "loading"} onClick={refresh}>Refresh tracking</button>
    </div>
    {state.kind === "loading" && <p role="status">Loading one-pager tracking…</p>}
    {state.kind === "error" && <p className="form-message" role="alert">Could not load one-pager tracking. Use Refresh tracking to retry.</p>}
    {tracking?.state === "pending" && <p role="status">Tracking has yet to start.</p>}
    {tracking?.state === "expired" && <p role="status">The 90-day tracking period has ended.</p>}
    {active && <>
      <p className="admin-note">Tracking started {formatPacific.format(active.startAt)} Pacific.</p>
      <section className="workspace-summary one-pager-summary" aria-label="One-pager engagement totals">
        <div className="workspace-summary-card"><span>Reports sent</span><strong>{active.total}</strong></div>
        {ONE_PAGER_METRICS.map(({ field, label }) => <div className="workspace-summary-card" key={field}>
          <span>{label}</span><strong>{active.reports.filter(row => row[field] !== null).length} of {active.total}</strong>
        </div>)}
        <div className="workspace-summary-card"><span>Average time on page</span>
          {viewTime === null ? <><strong>Not available</strong><p>Time on page is not being collected yet.</p></>
            : viewTime.reports ? <><strong>{formatViewTime(viewTime.averageSeconds)}</strong><p>Per report, all visits combined · {viewTime.reports} {viewTime.reports === 1 ? "report" : "reports"} with recorded time · {formatViewTime(viewTime.totalSeconds)} in total</p></>
              : <><strong>None recorded</strong><p>Counts from when time tracking was published.</p></>}
        </div>
      </section>
      {trend ? <OnePagerTrendChart points={trend} />
        : <p className="admin-note">No opens or clicks recorded yet. A chart of activity over time appears after the first one.</p>}
      <table className="directory-player-table one-pager-table" aria-label="First recorded activity per player report">
        <thead><tr><th scope="col">Player</th><th scope="col">First open</th><th scope="col">First Workout click</th><th scope="col">First TestFlight click</th><th scope="col">Time on page</th></tr></thead>
        <tbody>{active.reports.map(row => <tr key={row.id}>
          <td data-label="Player"><strong>{row.name}</strong></td>
          {ONE_PAGER_METRICS.map(({ field, label }) => <td data-label={label} key={field}>{row[field] === null ? "None recorded" : <time dateTime={new Date(row[field]).toISOString()}>{formatPacific.format(row[field])}</time>}</td>)}
          <td data-label="Time on page">{typeof row.viewSeconds !== "number" ? "Not available" : row.viewSeconds > 0 ? formatViewTime(row.viewSeconds) : "None recorded"}</td>
        </tr>)}</tbody>
      </table>
      <p className="admin-note">Time on page is an estimate. It counts while the report is the visible tab, for up to two minutes after it is opened or last touched, and two people reading the same link at once count once.</p>
    </>}
  </section>;
}
