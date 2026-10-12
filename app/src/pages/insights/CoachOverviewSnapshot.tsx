import { Link } from "react-router-dom";
import type { ExpandedInsights } from "./lib/expanded";

function snapshotDate(date: string, includeYear = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", ...(includeYear ? { year: "numeric" as const } : {}), timeZone: "UTC",
  });
}

function PlayerNames({ players, playerLink, label, tone }: { players?: { id: string; name: string; reasons?: string[] }[]; playerLink: (player: { id: string }) => string; label: string; tone?: "warning" }) {
  if (!players) return <span className="coach-snapshot-none">Player names unavailable</span>;
  return players.length ? <ul className={`coach-snapshot-names${tone ? ` is-${tone}` : ""}`} aria-label={label}>{players.map(player => <li key={player.id}><Link to={playerLink(player)} title={player.reasons?.join(" Â· ")}>{player.name || "Player"}</Link></li>)}</ul> : <span className="coach-snapshot-none">None</span>;
}

/** Follow-up is based on saved completions and comparable measured tests. */
export default function CoachOverviewSnapshot({ data, playerLink = player => `/insights?view=player&playerId=${encodeURIComponent(player.id)}` }: { data: ExpandedInsights; playerLink?: (player: { id: string }) => string }) {
  const focus = data.overview?.coachFocus?.version === 1 ? data.overview.coachFocus : null;
  const noCompletion = focus?.noCompletionPlayers, declining = focus?.decliningPlayers;
  const unique = focus ? new Set([...focus.noCompletionPlayers, ...focus.decliningPlayers].map(player => player.id)).size : null;
  const dateRange = `${snapshotDate(data.period.startDate, true)}–${snapshotDate(data.period.endDate, true)}`;
  return <section className="coach-snapshot" aria-label="Team snapshot">
    <header className="coach-snapshot-head"><h2 id="coach-snapshot-heading">Team snapshot</h2><span>{dateRange}</span></header>
    {data.participation ? <p>In {dateRange}, <strong>{data.participation.testingPlayers} of {data.roster.filtered}</strong> players recorded testing and <strong>{data.participation.workoutPlayers}</strong> recorded workout activity.</p> : <p>Participation summary unavailable for this period.</p>}
    <dl className="coach-snapshot-stats">
      <div className="coach-snapshot-need"><dt>Needs you</dt><dd className="coach-snapshot-value">{unique ?? '—'}</dd><dd>{unique === null ? 'Follow-up summary unavailable' : unique ? 'players with workout or testing flags' : 'No workout or testing flags'}</dd></div>
      <div><dt>No completed workouts</dt><dd className="coach-snapshot-value">{noCompletion?.length ?? '—'}</dd><dd>{noCompletion ? 'in this reporting period' : 'Completion summary unavailable'}</dd></div>
      <div><dt>Recent testing down</dt><dd className="coach-snapshot-value">{declining?.length ?? '—'}</dd><dd>{declining ? 'latest comparable results' : 'Testing trend summary unavailable'}</dd></div>
    </dl>
    <p className="insights-note">A workout gap means no completed session was saved in this period. Testing flags compare the same measured metrics on each test’s latest two dates through {data.period.endDate}. Missing tests and sign-in timestamps do not imply a decline or inactivity.</p>
    <div className="coach-snapshot-lists">
      <div className="coach-snapshot-list"><span className="coach-snapshot-list-label is-warning">No completed workouts <b>{noCompletion?.length ?? '—'}</b></span><PlayerNames players={noCompletion} playerLink={playerLink} label="Players with no completed workouts in this period" tone="warning" /></div>
      <div className="coach-snapshot-list"><span className="coach-snapshot-list-label is-warning">Recent testing down <b>{declining?.length ?? '—'}</b></span><PlayerNames players={declining} playerLink={playerLink} label="Players with a decline in recent testing" tone="warning" /></div>
    </div>
  </section>;
}
