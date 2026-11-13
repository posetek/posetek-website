import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { cloud } from "../../../lib/firebase";
import { formatViewTime } from "../lib/onePagerTrend";
import { JOURNEY_BUTTONS, JOURNEY_PERIODS, JOURNEY_VISIT_LIMIT, buttonTitle, followedLabel, formatPacific, inTeamScope, journeyFunnel, journeyNextStops, journeyPlayers, journeyTime, journeyVisits, onePagerJourney, shareOf, stopLabel } from "../lib/statsJourney";
import type { JourneyDays, JourneyTeamScope, OnePagerReportRow, StatsJourneyData } from "../lib/statsJourney";
import { useAccountLoad } from "../lib/useAccountLoad";

type Team = { id: string; name: string };
type RosterPlayer = { id: string; teamId: string | null };
const counted = (value: number, one: string) => `${value.toLocaleString("en-US")} ${value === 1 ? one : `${one}s`}`;

/**
 * Journey: what athletes do on the Stats page they land on, from our own first-party records
 * (docs/features/STATS_JOURNEY.md). The component only renders; `lib/statsJourney` counts.
 */
export default function StatsJourney({ organizationId, teamId, unassigned = false, teams, roster }: {
  organizationId: string; teamId?: string; unassigned?: boolean; teams: Team[];
  /** Current roster membership, which places one-pager reports in a selected team. */
  roster: RosterPlayer[];
}) {
  const [days, setDays] = useState<JourneyDays>(30), [includeStaff, setIncludeStaff] = useState(false);
  const loadJourney = useCallback(async () => (await cloud.httpsCallable("getStatsJourney")({ organizationId, days })).data as StatsJourneyData, [organizationId, days]);
  const { state, refresh } = useAccountLoad(loadJourney);
  // Every sent report of every cohort, read as the One-pager tracking tab reads them.
  const loadReports = useCallback(async () => {
    const { data } = await cloud.httpsCallable("getOnePagerEngagement")({ organizationId, view: "cohorts" });
    const cohorts = (data as { cohorts: { id: string }[] }).cohorts;
    const tracked = await Promise.all(cohorts.map(cohort => cloud.httpsCallable("getOnePagerEngagement")({ organizationId, cohortId: cohort.id })));
    return { reports: tracked.flatMap(({ data }) => (data as { state: string; reports?: OnePagerReportRow[] }).state === "active" ? (data as { reports: OnePagerReportRow[] }).reports : []) };
  }, [organizationId]);
  const { state: onePager, refresh: refreshOnePager } = useAccountLoad(loadReports);
  const team: JourneyTeamScope = { teamId, unassigned, teamIds: teams.map(row => row.id) };
  const reports = onePager.kind !== "ready" ? [] : team.teamId || team.unassigned
    ? onePager.data.reports.filter(report => roster.some(player => player.id === report.id && inTeamScope(player.teamId, team))) : onePager.data.reports;
  return <section id="workspace-report-panel-journey" role="tabpanel" aria-labelledby="workspace-report-tab-journey" tabIndex={0}>
    <div className="directory-view-toolbar">
      <div><h3>Stats page journey</h3>
        <div className="stats-journey-controls">
          <label className="directory-search directory-team-filter"><span>Period</span>
            <select value={days} onChange={event => setDays(Number(event.target.value) as JourneyDays)}>
              {JOURNEY_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="stats-journey-staff"><input type="checkbox" checked={includeStaff} onChange={event => setIncludeStaff(event.target.checked)} />Include staff</label>
        </div>
      </div>
      <button type="button" className="quiet-button" disabled={state.kind === "loading"} onClick={() => { refresh(); refreshOnePager(); }}>Refresh</button>
    </div>
    {state.kind === "loading" && <p role="status">Loading the Stats page journey…</p>}
    {state.kind === "error" && <p className="form-message" role="alert">Could not load the Stats page journey. Use Refresh to retry.</p>}
    {state.kind === "ready" && <JourneyReport data={state.data} includeStaff={includeStaff} team={team} teams={teams} />}
    {state.kind === "ready" && reports.length > 0 && <FromOnePager reports={reports} data={state.data} team={team} />}
  </section>;
}

function Card({ label, value, detail, children }: { label: string; value: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return <div className="workspace-summary-card"><span>{label}</span><strong>{value}</strong>{detail !== undefined && <p>{detail}</p>}{children}</div>;
}
function Split({ rows }: { rows: [string, number][] }) {
  return <ul className="stats-journey-split">{rows.map(([label, value]) => <li key={label}><span>{label}</span><b>{value}</b></li>)}</ul>;
}

function JourneyReport({ data, includeStaff, team, teams }: { data: StatsJourneyData; includeStaff: boolean; team: JourneyTeamScope; teams: Team[] }) {
  const visits = journeyVisits(data, { includeStaff, team });
  if (!visits.length) return <p role="status">No visits recorded yet.</p>;
  const funnel = journeyFunnel(visits), time = journeyTime(visits), stops = journeyNextStops(visits, data.endAt), players = journeyPlayers(visits, data.endAt);
  const teamName = (id: string | null) => id === null ? "Unassigned" : teams.find(row => row.id === id)?.name || "Team unavailable";
  return <>
    <p className="admin-note">{counted(players.length, "player")} · {counted(visits.length, "visit")}{!data.complete && ` · Only the newest ${JOURNEY_VISIT_LIMIT.toLocaleString("en-US")} visits are counted.`}</p>

    <h4 className="workspace-roster-heading">Funnel · players</h4>
    <section className="workspace-summary" aria-label="Funnel">
      <Card label="Landed on Stats" value={funnel.landed} />
      <Card label="Reached the buttons" value={funnel.reached} detail={`${shareOf(funnel.reached, funnel.landed)} of landed`} />
      <Card label="Clicked a button" value={funnel.clicked} detail={`${shareOf(funnel.clicked, funnel.landed)} of landed`}>
        <Split rows={JOURNEY_BUTTONS.map(button => [button.title, funnel.clickedBy[button.key]])} />
      </Card>
      <Card label="Followed through" value={funnel.followed} detail={`${shareOf(funnel.followed, funnel.landed)} of landed`}>
        <Split rows={JOURNEY_BUTTONS.map(button => [button.followed, funnel.followedBy[button.key]])} />
      </Card>
    </section>

    <h4 className="workspace-roster-heading">Time on Stats · median per visit</h4>
    <section className="workspace-summary stats-journey-summary" aria-label="Time on Stats">
      {([["All visits", time.all], ["With a button click", time.clicked], ["Without a click", time.other]] as const).map(([label, group]) =>
        <Card key={label} label={label} value={group.median === null ? "—" : formatViewTime(group.median)} detail={counted(group.visits, "visit")} />)}
    </section>

    <h4 className="workspace-roster-heading">Next stop · visits</h4>
    <table className="directory-player-table stats-journey-table stats-journey-stops" aria-label="Next stop">
      <thead><tr><th scope="col">Next stop</th><th scope="col">Visits</th><th scope="col">Share</th><th scope="col">By button</th><th scope="col">By tabs</th></tr></thead>
      <tbody>{stops.rows.map(row => <tr key={row.key}>
        <td data-label="Next stop"><strong>{row.label}</strong></td>
        <td data-label="Visits">{row.visits}</td>
        <td data-label="Share">{shareOf(row.visits, stops.finished)}</td>
        <td data-label="By button">{row.key === "left" ? "—" : row.byButton}</td>
        <td data-label="By tabs">{row.key === "left" ? "—" : row.byTabs}</td>
      </tr>)}</tbody>
    </table>
    {stops.open > 0 && <p className="admin-note">{counted(stops.open, "visit")} from the last 30 minutes with no next stop yet {stops.open === 1 ? "is" : "are"} not counted.</p>}

    <h4 className="workspace-roster-heading">Players</h4>
    <table className="directory-player-table stats-journey-table stats-journey-players" aria-label="Players">
      <thead><tr><th scope="col">Player</th>{!team.teamId && <th scope="col">Team</th>}<th scope="col">Visits</th><th scope="col">First visit (Pacific)</th><th scope="col">Time on Stats</th>
        <th scope="col">Reached buttons</th><th scope="col">Clicked</th><th scope="col">Next stop</th><th scope="col">Followed through</th></tr></thead>
      <tbody>{players.map(row => <tr key={row.playerId}>
        <td data-label="Player"><strong>{data.players[row.playerId]?.name || "Player"}</strong></td>
        {!team.teamId && <td data-label="Team">{teamName(row.teamId)}</td>}
        <td data-label="Visits">{row.visits}{includeStaff && row.staffVisits > 0 ? ` (${row.staffVisits} staff)` : ""}</td>
        <td data-label="First visit"><time dateTime={new Date(row.firstAt).toISOString()}>{formatPacific.format(row.firstAt)}</time></td>
        <td data-label="Time on Stats">{formatViewTime(row.viewSeconds)}</td>
        <td data-label="Reached buttons">{row.reached ? "Yes" : "No"}</td>
        <td data-label="Clicked">{row.clicked.length ? row.clicked.map(buttonTitle).join(", ") : "None"}</td>
        <td data-label="Next stop">{row.next ? stopLabel(row.next) : "Still open"}</td>
        <td data-label="Followed through">{row.followed.length ? row.followed.map(followedLabel).join(", ") : "No"}</td>
      </tr>)}</tbody>
    </table>
  </>;
}

/** Secondary: one-pager reports followed onto the Stats page by the athlete themselves. */
function FromOnePager({ reports, data, team }: { reports: OnePagerReportRow[]; data: StatsJourneyData; team: JourneyTeamScope }) {
  const steps = onePagerJourney(reports, journeyVisits(data, { includeStaff: true, team }));
  return <section className="stats-journey-onepager" aria-labelledby="stats-journey-onepager-title">
    <h4 id="stats-journey-onepager-title" className="workspace-roster-heading">From the one-pager</h4>
    <ol className="stats-journey-steps">
      {([["Reports sent", steps.sent], ["Opened", steps.opened], ["Has an account", steps.account], ["Landed on Stats", steps.landed], ["Clicked a button", steps.clicked]] as const)
        .map(([label, value]) => <li key={label}>{label} <strong>{value}</strong></li>)}
    </ol>
  </section>;
}
