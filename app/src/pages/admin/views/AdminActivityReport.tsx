import { Component, Fragment, Suspense, lazy, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FEATURE_LABELS, minuteText, workoutDurationText } from '../../insights/lib/expanded';
import type { ExpandedInsights, ExpandedReportSummary } from '../../insights/lib/expanded';
import type { ExpandedRequest } from '../../insights/lib/expandedQuery';
import { adminActivitySelection } from '../lib/adminActivity';
import type { AdminActivityFollowUp, AdminActivityReportData, AdminActivitySort, AdminPlayerActivity } from '../lib/adminActivity';
import { activityDate, activityWindow, exactWorkoutLink } from '../lib/adminActivityPresentation';
import AdminReportingCards from './AdminReportingCards';
import './admin-activity-report.scss';

type View = 'overview' | 'workouts' | 'usage';
type PlayerLink = (playerId: string, panel: 'results' | 'workouts' | 'profile') => string;
export interface AdminActivityReportProps {
  data: ExpandedInsights | ExpandedReportSummary; request: ExpandedRequest; view: View; busy?: boolean; children?: ReactNode; detailsPending?: boolean;
  onChange(patch: Partial<ExpandedRequest>): void; onFirstPage(): void; onNextPage(): void;
  onExplore?(patch: Partial<ExpandedRequest>): void;
  playerLink: PlayerLink; teamLink(organizationId: string, teamId: string | null): string;
}
const GROUPS: { key: Exclude<AdminActivityFollowUp, 'all' | 'active'>; title: string; note: string }[] = [
  { key: 'noSignIn', title: 'No recorded sign-in', note: 'Current account evidence' },
  { key: 'noActivity', title: 'No collected active use', note: 'Collection exists · selected period' },
  { key: 'unfinishedAssigned', title: 'Unfinished assigned workouts', note: 'Players with work remaining this week' },
  { key: 'noCompletion', title: 'No completed workouts', note: 'No saved completion in this period' },
];
const SORTS: [AdminActivitySort, string][] = [
  ['name', 'Player name'], ['activeMinutes', 'Most estimated app use'], ['workoutMinutes', 'Most workout timer time'],
  ['lastActivity', 'Latest observed app use'], ['lastWorkout', 'Latest workout'], ['unfinishedAssigned', 'Most assigned work remaining'],
];
const OUTCOMES: Record<string, string> = { completed: 'Completed', endedEarly: 'Ended early', abandoned: 'Abandoned', inProgress: 'No ending recorded', unknown: 'Ending not specified' };
function Stat({ title, value, note, onClick, disabled }: { title: string; value: ReactNode; note: string; onClick?: () => void; disabled?: boolean }) {
  return <div className="activity-stat activity-card"><dt>{onClick ? <button type="button" className="activity-stat-action" disabled={disabled} onClick={onClick} aria-label={`Show players: ${title}`}>{title}<span aria-hidden="true">↗</span></button> : title}</dt><dd>{value}</dd><dd className="activity-stat-note">{note}</dd></div>;
}
const percentage = (count: number, total: number) => total ? `${Math.round(count / total * 100)}%` : '—';
function SignIn({ activity, timezone }: { activity?: AdminPlayerActivity; timezone: string }) {
  const signIn = activity?.signIn;
  return <><span className={`activity-state${!signIn || signIn.status === 'unknown' ? ' is-unknown' : ''}`}>
    {!signIn || signIn.status === 'unknown' ? 'Sign-in evidence unavailable' : signIn.status === 'recorded' ? 'Sign-in recorded' : signIn.status === 'unlinked' ? 'Account not linked' : 'No sign-in recorded'}
  </span>{signIn?.status === 'recorded' && <small>{activityDate(signIn.lastSignInAtMillis, timezone)}</small>}</>;
}
function Assigned({ activity }: { activity?: AdminPlayerActivity }) {
  const assigned = activity?.assigned;
  if (!assigned || assigned.status === 'unavailable') return <span className="activity-missing">Assignment progress unavailable</span>;
  if (assigned.status === 'noActivePlan') return <span className="activity-missing">No active plan</span>;
  return <><strong>{assigned.remaining == null ? 'Remaining unavailable' : `${assigned.remaining} remaining`}</strong>
    <small>{assigned.weekNumber == null ? 'Current plan week' : `Current plan · week ${assigned.weekNumber}`}</small>
    <small>{assigned.notStarted == null ? 'Not-started count unavailable' : `${assigned.notStarted} not started`} · {assigned.noEnding == null ? 'Open-log count unavailable' : `${assigned.noEnding} with no ending`}</small></>;
}
function LastObservedFeature({ activity, collected, timezone }: { activity?: AdminPlayerActivity; collected: boolean; timezone: string }) {
  if (!activity) return <span className="activity-missing">Activity window unavailable</span>;
  const window = activity.usage.lastActivityWindow;
  if (!window) return <span className="activity-missing">{collected ? 'No retained activity window' : 'Not collected'}</span>;
  const evidence = window.featureEvidence;
  let description;
  if (evidence?.basis === 'latestInterval') {
    description = evidence.features.length === 1 ? 'Latest measured interval' : 'Latest observations tied';
  } else if (evidence?.basis === 'window') {
    description = 'Window summary · order unknown';
  }
  return <>
    <strong>{evidence ? evidence.features.map(feature => FEATURE_LABELS[feature]).join(', ') : 'Feature unavailable'}</strong>
    {description && <small>{description}</small>}
    <small>{activityWindow(window, timezone)}</small>
  </>;
}
function Rankings({ report, playerLink }: { report: Omit<AdminActivityReportData, 'sort' | 'followUp'>; playerLink: PlayerLink }) {
  return <div className="activity-rankings">
    <section className="activity-ranking activity-card" aria-labelledby="activity-workout-rank"><h2 id="activity-workout-rank">Most workout activity</h2><p className="activity-note">Workouts, training, videos and planning · measured website and iOS time.</p>
      {report.metricsV2?.topTrainingPlayers ? report.metricsV2.topTrainingPlayers.length ? <ol>{report.metricsV2.topTrainingPlayers.map(player => <li key={player.id}><Link to={playerLink(player.id, 'workouts')}>{player.name || 'Player'}</Link><span>{minuteText(player.activeMinutes)}</span></li>)}</ol> : <p className="activity-note">No measured workout activity in this selection.</p> : <p className="activity-note">Workout activity breakdown unavailable. Saved timer totals remain in Workouts.</p>}
    </section>
    <section className="activity-ranking activity-card" aria-labelledby="activity-use-rank"><h2 id="activity-use-rank">Most time on platform</h2><p className="activity-note">Measured website and iOS activity in the selected period. Simultaneous use is counted once.</p>
      {report.topActivePlayers.length ? <ol>{report.topActivePlayers.map(player => <li key={player.id}><Link to={playerLink(player.id, 'results')}>{player.name || 'Player'}</Link><span>{minuteText(player.activeMinutes)}</span></li>)}</ol> : <p className="activity-note">No positive measured app use in this selection.</p>}
    </section>
  </div>;
}
export function TeamComparison({ data, teamLink, coachNames }: Pick<AdminActivityReportProps, 'data' | 'teamLink'> & { coachNames?: Record<string, string> }) {
  const teams = data.adminReporting?.teams;
  if (data.scope.kind === 'team' || !teams?.length) return null;
  return <section className="activity-team-comparison activity-card" aria-labelledby="activity-team-title"><div className="activity-section-heading"><div><h2 id="activity-team-title">Compare teams</h2><p className="activity-note">The full reporting selection, before follow-up groups or name search.</p></div></div>
    <div className="activity-table-wrap"><table className="activity-table"><caption>Team activity in this reporting scope</caption><thead><tr><th scope="col">Team</th><th scope="col">Recorded sign-in</th><th scope="col">Active players</th><th scope="col">Estimated app use</th><th scope="col">Workouts</th><th scope="col">Workout duration</th></tr></thead>
      <tbody>{teams.map(team => <tr key={`${team.organizationId}:${team.teamId || 'unassigned'}`}><th scope="row"><Link to={teamLink(team.organizationId, team.teamId)}>{team.name || 'Unassigned'}</Link><small>{team.players} players{data.scope.kind === 'global' ? ` · ${data.choices.organizations.find(org => org.id === team.organizationId)?.name || 'Organization'}` : ''}</small>{coachNames && <small>{coachNames[`${team.organizationId}/${team.teamId || ''}`] || 'No active coach assigned'}</small>}</th>
        <td data-label="Recorded sign-in"><strong>{team.signInRecordedPlayers}/{team.players} · {percentage(team.signInRecordedPlayers, team.players)}</strong><small>{team.signInNonePlayers + team.signInUnlinkedPlayers} without recorded sign-in</small><small>{team.signInUnknownPlayers} unavailable</small></td>
        <td data-label="Active players"><strong>{team.activePlayers}/{team.players} · {percentage(team.activePlayers, team.players)}</strong><small>{team.collectedPlayers}/{team.players} with collection · {percentage(team.collectedPlayers, team.players)}</small></td>
        <td data-label="Estimated app use"><strong>{minuteText(team.activeMinutes, team.collectedPlayers > 0)}</strong></td>
        <td data-label="Workouts"><strong>{team.workoutStarted} started</strong><small>{team.workoutCompleted} completed</small></td>
        <td data-label="Workout duration"><strong>{workoutDurationText(team.timerMinutes, team.timerRecords)} timer</strong><small>{workoutDurationText(team.estimatedMinutes, team.estimatedRecords)} estimate</small><small>{team.timerRecords} timer logs · {team.estimatedRecords} estimated logs</small></td>
      </tr>)}</tbody></table></div>
  </section>;
}
class RecentHistoryBoundary extends Component<{ children: ReactNode; retry(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div role="alert"><p>Recent workouts could not be opened. You can retry or open the full workout record.</p><button type="button" className="quiet-button" onClick={this.props.retry}>Retry recent workouts</button></div> : this.props.children; }
}
function RecentHistory({ playerId }: { playerId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [Recent, setRecent] = useState(() => lazy(() => import('./AdminRecentWorkouts')));
  return <RecentHistoryBoundary key={attempt} retry={() => { setRecent(() => lazy(() => import('./AdminRecentWorkouts'))); setAttempt(value => value + 1); }}><Suspense fallback={<p role="status">Loading recent workouts…</p>}><Recent playerId={playerId} /></Suspense></RecentHistoryBoundary>;
}
function PlayerRows({ data, view, playerLink }: { data: ExpandedInsights; view: View; playerLink: PlayerLink }) {
  const [expanded, setExpanded] = useState('');
  const timezone = data.period.timeZone;
  const columns = view === 'overview' ? ['Player', 'Recorded sign-in', 'Estimated app use', 'Workouts completed', 'Assigned work']
    : view === 'workouts' ? ['Player', 'Period activity', 'Recorded duration', 'Latest saved workout', 'Assigned work', 'Recent history']
      : ['Player', 'Estimated app use', 'Active days', 'Platforms', 'Last observed feature'];
  return <div className="activity-table-wrap"><table className="activity-table"><caption>Player activity in this reporting scope</caption><thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
    <tbody>{data.players.map(player => {
      const name = `${player.firstName} ${player.lastName}`.trim() || 'Player';
      const activity = player.adminReporting, latest = activity?.workouts.latest;
      const open = view === 'workouts' && expanded === player.id;
      return <Fragment key={player.id}><tr className={open ? 'is-expanded' : undefined}>
        <th scope="row"><Link id={`admin-player-${player.id}`} to={playerLink(player.id, view === 'workouts' ? 'workouts' : 'results')}>{name}</Link><small className="activity-person-scope">{player.teamName || 'Unassigned'}{data.scope.kind === 'global' ? ` · ${player.organizationName}` : ''}</small></th>
        {view === 'overview' && <><td data-label="Recorded sign-in"><SignIn activity={activity} timezone={timezone} /></td><td data-label="Estimated app use"><strong>{minuteText(player.usage.activeMinutes, player.usage.collected)}</strong><small>{player.usage.collected ? `${player.usage.activeDays} active days` : 'Collection unavailable'}</small></td><td data-label="Workouts completed"><strong>{player.workouts.completed}</strong><small>Personal + assigned + extra</small></td><td data-label="Assigned work"><Assigned activity={activity} /></td></>}
        {view === 'workouts' && <><td data-label="Period activity"><strong>{player.workouts.started} started</strong><small>{player.workouts.completed} completed</small></td>
          <td data-label="Recorded duration"><strong>{workoutDurationText(player.workouts.timerMinutes, player.workouts.timerRecords)} timer</strong><small>{workoutDurationText(player.workouts.estimatedMinutes, player.workouts.estimatedRecords)} elapsed estimate</small></td>
          <td data-label="Latest saved workout">{latest ? <><Link className="activity-row-action" to={exactWorkoutLink(playerLink(player.id, 'workouts'), latest)}>{latest.title || 'Saved workout'}</Link><span className="activity-state">{OUTCOMES[latest.status] || 'Status unavailable'}</span><small>Started {activityDate(latest.startedAtMillis, timezone)}</small><small>{latest.endedAtMillis == null ? 'No ending recorded' : `Ended ${activityDate(latest.endedAtMillis, timezone)}`}</small><small>{latest.timerMinutes != null ? `${minuteText(latest.timerMinutes)} recorded timer` : latest.estimatedMinutes != null ? `${minuteText(latest.estimatedMinutes)} elapsed estimate` : 'Duration not recorded'} · {latest.setsCompleted} sets recorded</small></> : <span className="activity-missing">{activity ? 'No saved workout' : 'Latest workout unavailable'}</span>}</td>
          <td data-label="Assigned work"><Assigned activity={activity} /></td><td data-label="Recent history"><button id={`admin-player-${player.id}-history`} type="button" className="activity-row-action" aria-label={`${open ? 'Hide' : 'Show'} recent workouts for ${name}`} aria-expanded={open} aria-controls={`activity-history-${player.id}`} onClick={() => setExpanded(open ? '' : player.id)}>{open ? 'Hide recent workouts' : 'Show recent workouts'}</button></td></>}
        {view === 'usage' && <><td data-label="Estimated app use"><strong>{minuteText(player.usage.activeMinutes, player.usage.collected)}</strong></td><td data-label="Active days"><strong>{player.usage.collected ? player.usage.activeDays : 'Not collected'}</strong></td><td data-label="Platforms"><strong>{minuteText(player.usage.webMinutes, player.usage.webCollected)} website</strong><small>{minuteText(player.usage.iosMinutes, player.usage.iosCollected)} iOS</small></td>
          <td data-label="Last observed feature"><LastObservedFeature activity={activity} collected={player.usage.collected} timezone={timezone} /></td></>}
      </tr>{open && <tr className="activity-expanded-row"><td className="activity-expansion-cell" colSpan={columns.length}><section id={`activity-history-${player.id}`} className="activity-expansion" aria-label={`Recent workouts for ${name}`}><div className="activity-expansion-heading"><h3>Recent workouts · {name}</h3><Link className="quiet-button" to={playerLink(player.id, 'workouts')}>Open full workout record</Link></div><RecentHistory key={player.id} playerId={player.id} /></section></td></tr>}</Fragment>;
    })}</tbody></table></div>;
}
export default function AdminActivityReport({ data, request, view, busy, onChange, onFirstPage, onNextPage, playerLink, children, detailsPending = false }: AdminActivityReportProps) {
  const selection = adminActivitySelection(view, request.adminFollowUp, request.adminSort);
  const [searchDraft, setSearchDraft] = useState({ source: request.rosterSearch, value: request.rosterSearch });
  const search = searchDraft.source === request.rosterSearch ? searchDraft.value : request.rosterSearch;
  const report = data.adminReporting;
  const selectedGroup = GROUPS.find(group => group.key === selection.followUp);
  const selectionLabel = selection.followUp === 'active' ? 'Active players, including returning players' : selectedGroup?.title;
  const exact = "players" in data ? data : null;
  const start = exact ? request.page * exact.pagination.pageSize + (exact.players.length ? 1 : 0) : 0, end = exact ? request.page * exact.pagination.pageSize + exact.players.length : 0;
  return <div className="admin-activity-report" aria-label="Admin activity report" aria-busy={busy || false}>
    {!report && <p className="form-message" role="status">Detailed account activity is unavailable in this report. Existing period totals remain available below; refresh reporting to retry.</p>}
    {view === 'workouts' ? <dl className="activity-summary"><Stat title="Workouts started" value={data.workouts.started} note="Saved logs and phone sessions started in the selected period" /><Stat title="Workouts completed" value={data.workouts.completed} note="Saved completions and phone sessions with recorded work" /><Stat title="Recorded timer duration" value={workoutDurationText(data.workouts.timerMinutes, data.workouts.timerRecords)} note="Saved active timer time; pauses excluded" /></dl> : <AdminReportingCards metrics={report?.metricsV2} />}
    {view === 'overview' && report && <Rankings report={report} playerLink={playerLink} />}
    {children}
    <details className="activity-method"><summary>How this is measured</summary><p className="activity-note">Workout records and rankings cover {data.period.startDate} through {data.period.endDate}, in {data.period.timeZone}. Participation and usage cards use the cutoffs and weekly windows in Metric definitions. All summaries cover the complete reporting selection before name search and pagination. Workout timers and elapsed estimates remain separate.</p>
      <p className="activity-note">{report ? `Account sign-in, latest saved workout and current-week assignments were checked ${activityDate(report.asOfMillis, data.period.timeZone)}. ` : ''}These are current account and workout facts, even when the reporting period is historical. A recorded sign-in does not mean the player is online. No recorded sign-in includes unlinked accounts; unknown sign-in evidence is separate.</p>
      <p className="activity-note">The latest observed app use appears in a 15-minute retained activity window through the reporting cutoff. It may precede the selected period. The window is not a precise logout or stopping time.</p>
      {view === 'usage' && <p className="activity-note">The feature names describe areas of the app. Recent intervals identify the last measured feature and show ties together. A window summary lists areas with recorded use in that quarter hour. Their order is unknown. Times use {data.period.timeZone}.</p>}
      <p className="activity-note">Unfinished assigned work describes the current active plan week and may include workouts not yet started or with no ending. It is separate from having no completed workouts in the reporting period. A saved completion can contain partial or skipped work; an open log does not mean the player is training now.</p>
    </details>
    <section className="activity-card" aria-labelledby="activity-people-title"><div className="activity-section-heading"><div><h2 id="activity-people-title" tabIndex={-1}>{view === 'workouts' ? 'Player workouts' : view === 'usage' ? 'Player app usage' : 'People in this selection'}</h2><p className="activity-note">{exact ? `${exact.pagination.total.toLocaleString()} matching players · ${report ? "Sorted across the complete reporting selection." : "Current reporting page."}` : "Player details for the selected view"}</p></div><p className="activity-period">{data.period.startDate} – {data.period.endDate}<br />{data.period.timeZone}</p></div>
      {exact ? <><div className="activity-roster-toolbar"><form className="activity-search" onSubmit={event => { event.preventDefault(); onChange({ rosterSearch: search.trim(), cursor: '', page: 0 }); }}><label>Find a player in this report<input type="search" value={search} maxLength={120} placeholder="Player name" onChange={event => setSearchDraft({ source: request.rosterSearch, value: event.target.value })} /></label><button type="submit" className="quiet-button" disabled={busy}>Search</button></form>
        <label>Sort players<select aria-label="Sort players" value={selection.sort} disabled={busy || !report} onChange={event => onChange({ adminSort: event.target.value as AdminActivitySort, cursor: '', page: 0 })}>{SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {(selectionLabel || request.rosterSearch) && <div className="activity-filter-summary"><span>{selectionLabel || 'All follow-up groups'}{request.rosterSearch ? ` · Name: ${request.rosterSearch}` : ''}</span><button type="button" className="quiet-button" disabled={busy} onClick={() => onChange({ adminFollowUp: 'all', rosterSearch: '', cursor: '', page: 0 })}>Clear</button></div>}
      {exact.players.length ? <PlayerRows data={exact} view={view} playerLink={playerLink} /> : <p className="activity-empty">No players match this selection. Clear the follow-up group or name search to review the full reporting roster.</p>}
      <nav className="activity-pagination" aria-label="Activity player pages"><p>{exact.players.length ? `${start}–${end} of ${exact.pagination.total.toLocaleString()}` : '0 matching players'} · summaries above cover the full reporting selection.</p><div><button type="button" className="quiet-button" disabled={busy || request.page === 0} onClick={onFirstPage}>First page</button><button type="button" className="quiet-button" disabled={busy || !exact.pagination.nextCursor} onClick={onNextPage}>Next</button></div></nav></> : <p className="activity-note" role="status">{detailsPending ? "Loading player details…" : "Player details are unavailable. Refresh reporting to retry."}</p>}
    </section>

  </div>;
}
