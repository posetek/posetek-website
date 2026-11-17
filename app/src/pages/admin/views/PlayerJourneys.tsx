import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { cloud } from '../../../lib/firebase';
import { shiftDate } from '../../insights/lib/expandedQuery';
import { adminDirectoryPath, workspaceReportRequest } from '../lib/adminNavigation';
import type { AdminDirectoryState } from '../lib/adminNavigation';
import { activityDate } from '../lib/adminActivityPresentation';
import type { AdminPlayerJourneys, AdminPlayerJourneysRequest, JourneyEvent, JourneyPage, JourneySession } from '../lib/playerJourneyContract';
import { useAccountLoad } from '../lib/useAccountLoad';
import { USAGE_CLIENTS, USAGE_CLIENT_LABELS } from '../lib/usageStory';
import type { UsageClient } from '../lib/usageStory';
import { formatViewTime } from '../lib/onePagerTrend';
import StatsJourney from './StatsJourney';
import './usage-story.scss';

const PAGES: Record<JourneyPage, string> = { saved_workouts: 'Saved workouts', workout_history: 'Workout history', tests: 'Tests', home: 'Home / Social', stats: 'Stats', workouts: 'Workouts', plan: 'Plan setup', coach: 'Coach', training: 'Workout player', results: 'Test results', video: 'Video', planner: 'Planner', feed: 'Social feed', profile: 'Profile', leaderboards: 'Leaderboards', settings: 'Settings', other: 'Other page' };
const pageLabel = (page: JourneyPage | null) => page ? PAGES[page] || 'Other page' : 'Not recorded';
const actionLabel = (target: string) => ({ start_workout: 'Start workout', generate_plan: 'Generate plan', send_message: 'Send message', open_video: 'Open video', download_report: 'Download report', workout_started: 'Workout started', plan_created: 'Plan created', message_sent: 'Message sent' }[target] || PAGES[target as JourneyPage] || 'Other action');
const entryLabel = (entry: string) => ({ sign_in: 'After explicit sign-in', signup: 'After signup', restored: 'Restored session', open: 'Opened workspace', continue: 'Continued session', deep_link: 'Deep link', report_stats: 'Report → Stats', report_workouts: 'Report → Workouts' }[entry] || 'Entry unknown');
type Props = { state: AdminDirectoryState; choose(patch: Partial<AdminDirectoryState>): void; organizationId: string; teamId?: string; unassigned?: boolean; teams: { id: string; name: string }[]; roster: { id: string; teamId: string | null }[] };

export default function PlayerJourneys(props: Props) {
  const { state, choose } = props;
  const view = state.journeyView || 'pages';
  const href = (patch: Partial<AdminDirectoryState>) => adminDirectoryPath({ ...state, ...patch, journeyCursor: undefined });
  return <section id="workspace-report-panel-journey" role="tabpanel" aria-labelledby="workspace-report-tab-journey" tabIndex={0} className="usage-story">
    <h3>Player journeys</h3><p className="admin-note">Recorded navigation and activity by platform. A last page shows where activity stopped being observed, not why someone left.</p>
    <nav className="usage-story-views" aria-label="Journey views">{(['pages', 'paths', 'players', 'stats'] as const).map(key => <Link className="usage-story-view" key={key} aria-current={view === key ? 'page' : undefined} to={href({ journeyView: key, journeyPlayer: undefined })}>{key === 'stats' ? 'Stats funnel' : key[0].toUpperCase() + key.slice(1)}</Link>)}</nav>
    {view === 'stats' ? <StatsJourney embedded selectedDays={state.journeyStatsDays || 30} selectedStaff={Boolean(state.journeyIncludeStaff)} onDaysChange={journeyStatsDays => choose({ journeyStatsDays })} onStaffChange={journeyIncludeStaff => choose({ journeyIncludeStaff })} organizationId={props.organizationId} teamId={props.teamId} unassigned={props.unassigned} teams={props.teams} roster={props.roster} /> : <GeneralJourney {...props} view={view} choose={patch => choose({ ...patch, journeyCursor: undefined })} href={href} />}
  </section>;
}

function GeneralJourney({ state, choose, organizationId, teamId, unassigned, view, href }: Props & { view: 'pages' | 'paths' | 'players'; href(patch: Partial<AdminDirectoryState>): string }) {
  const period = workspaceReportRequest(state), clientKind = state.reportUsageClientKind || 'desktop_web';
  const startDate = period.startDate < shiftDate(period.endDate, -89) ? shiftDate(period.endDate, -89) : period.startDate;
  const playerId = view === 'players' ? state.journeyPlayer : undefined;
  const payload: AdminPlayerJourneysRequest = { organizationId, ...(teamId ? { teamId } : {}), ...(unassigned ? { unassigned: true } : {}), startDate, endDate: period.endDate, timeZone: period.timezone,
    clientKind, ...(playerId ? { playerId } : {}), ...(state.journeyCursor ? { cursor: state.journeyCursor } : {}), pageSize: playerId ? 10 : 20,
    cohort: state.journeyCohort || 'all', entryFilter: state.journeyEntry || 'all' };
  const key = JSON.stringify(payload);
  const loader = useCallback(async () => {
    const request = JSON.parse(key) as AdminPlayerJourneysRequest;
    const result = (await cloud.httpsCallable('getAdminPlayerJourneys')(request)).data as AdminPlayerJourneys;
    if (!result || result.version !== 1 || result.startDate !== request.startDate || result.endDate !== request.endDate || typeof result.complete !== 'boolean'
      || (request.playerId ? result.view !== 'player' || result.player.id !== request.playerId || !Array.isArray(result.sessions) : result.view !== 'overview' || !Array.isArray(result.segments) || !Array.isArray(result.players))) throw new Error('Journey response does not match the selected scope.');
    return result;
  }, [key]);
  const { state: loaded, refresh } = useAccountLoad(loader);
  const data = loaded.kind === 'ready' ? loaded.data : null;
  const segment = data?.view === 'overview' ? data.segments.find(row => row.clientKind === clientKind) : null;
  const awaitingIOSBuild = data && clientKind === 'ios' && !data.supportedIOSBuilds?.length
    && (data.view === 'player' ? data.sessions.length === 0 : !segment?.sessionCount);
  const usageHref = href({ directoryPane: 'report', reportView: 'usage', reportUsageCohortGroup: 'active',
    reportPage: 0, reportCursor: undefined, journeyPlayer: undefined });
  return <>
    <div className="usage-story-controls">
      <label>Platform<select aria-label="Journey platform" value={clientKind} onChange={event => choose({ reportUsageClientKind: event.target.value as UsageClient })}>{USAGE_CLIENTS.map(key => <option key={key} value={key}>{USAGE_CLIENT_LABELS[key]}</option>)}</select></label>
      <label>From<input aria-label="Journey start date" type="date" value={startDate} max={period.endDate} min={shiftDate(period.endDate, -89)} onChange={event => choose({ reportStart: event.target.value })} /></label>
      <label>Through<input aria-label="Journey end date" type="date" value={period.endDate} onChange={event => choose({ reportEnd: event.target.value })} /></label>
      <label>Timezone<select aria-label="Journey timezone" value={period.timezone} onChange={event => choose({ reportTimezone: event.target.value })}>{['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'UTC'].map(zone => <option key={zone}>{zone}</option>)}</select></label>
      <label>Player history<select value={state.journeyCohort || 'all'} onChange={event => choose({ journeyCohort: event.target.value as AdminDirectoryState['journeyCohort'] })}><option value="all">All recorded players</option><option value="new">First recorded use</option><option value="existing">Previously active</option><option value="unknown">History unknown</option></select></label>
      <label>Entry<select value={state.journeyEntry || 'all'} onChange={event => choose({ journeyEntry: event.target.value as AdminDirectoryState['journeyEntry'] })}><option value="all">All entries</option><option value="sign_in">Following explicit sign-in</option></select></label>
      <button type="button" className="quiet-button" disabled={loaded.kind === 'loading'} onClick={refresh}>Refresh journeys</button>
    </div>
    <p className="admin-note">{startDate} – {period.endDate} · {period.timezone}. Player-account activity only. Platform counts overlap and must not be added.</p>
    {loaded.kind === 'loading' && <p role="status">Loading player journeys…</p>}
    {loaded.kind === 'error' && <p role="alert" className="form-message">Could not load player journeys. Refresh journeys to retry. No zero activity is inferred.</p>}
    {data && <>
      <p className="admin-note">Collection coverage start: {data.coverageStartedAtMillis === null ? 'not confirmed for this selection' : activityDate(data.coverageStartedAtMillis, period.timezone)}. {clientKind === 'ios' ? `Verified iOS builds for journeys: ${data.supportedIOSBuilds?.length ? data.supportedIOSBuilds.join(', ') : 'none recorded yet'}. Only installed instrumented builds contribute.` : 'Historical website records cannot be split into desktop and mobile browsers.'}</p>
      {awaitingIOSBuild && <div role="status" className="form-message"><strong>Native iOS journeys need a supported app build.</strong><p>Existing iOS activity can appear in Usage. Page visits, navigation paths and button actions require an app build that records journeys; none is verified yet. This does not mean players have not used the app.</p><Link to={usageHref}>View recorded iOS usage</Link></div>}
      {!data.complete && <p role="alert" className="form-message">Incomplete report. The available records are shown, but totals, rates and paths are partial and should not be compared with complete periods.</p>}
      {data.view === 'overview' && !awaitingIOSBuild && <>
        <p className="admin-note">{segment?.playerCount ?? 0} recorded players · {segment?.sessionCount ?? 0} sessions · {segment?.ongoingSessions ?? 0} ongoing · {segment?.incompleteSessions ?? 0} incomplete.</p>
        {!segment?.sessionCount ? <p role="status">No journeys recorded for this platform in this period. Coverage gaps and older installs are unmeasured.</p> : view === 'pages' ? <PageActivity pages={segment.pages} /> : view === 'paths' ? <>
          <h4>Common recorded paths</h4><p className="admin-note">Ordered pages within each tab or app scene. Separate devices and tabs are never stitched into one path.</p>
          <table className="activity-table" aria-label="Common player paths"><thead><tr><th scope="col">Page sequence</th><th scope="col">Sessions</th></tr></thead><tbody>{segment.paths.map((path, index) => <tr key={index}><td data-label="Page sequence" className="usage-story-path">{path.pages.map(pageLabel).join(' → ')}</td><td data-label="Sessions">{path.count}</td></tr>)}</tbody></table>
        </> : <>
          <h4>Players in this selection</h4><table className="activity-table" aria-label="Journey players"><thead><tr><th scope="col">Player</th><th scope="col">Team</th><th scope="col">Sessions</th><th scope="col">Last recorded activity</th></tr></thead><tbody>{data.players.map(player => <tr key={player.id}><th scope="row"><Link to={href({ journeyView: 'players', journeyPlayer: player.id })}>{player.name || 'Player'}</Link></th><td data-label="Team">{player.teamName || 'Unassigned'}</td><td data-label="Sessions">{player.sessionCount}</td><td data-label="Last recorded activity">{activityDate(player.lastActivityAtMillis, period.timezone)}</td></tr>)}</tbody></table>
        </>}
      </>}
      {data.view === 'player' && <>
        <Link to={href({ journeyPlayer: undefined })}>All players in this selection</Link><h4>{data.player.name || 'Player'} · recent sessions</h4>
        {!data.sessions.length && !awaitingIOSBuild && <p>No retained sessions match these filters. Older history may have expired.</p>}
        {data.sessions.map((session, index) => <Session key={`${session.startedAtMillis}:${index}`} session={session} timezone={period.timezone} />)}
      </>}
      {view === 'players' && <nav className="activity-pagination" aria-label="Journey pages"><Link className="quiet-button" to={href({ journeyView: 'players' })}>First page</Link>{data.nextCursor && <Link className="quiet-button" to={adminDirectoryPath({ ...state, journeyCursor: data.nextCursor })}>Next</Link>}</nav>}
      <details className="activity-method"><summary>Journey definitions and coverage</summary><p>Active time pauses when hidden, unfocused or idle. Visits end after 30 minutes without activity. An unobserved ending is labeled “Last observed here”; it does not prove that a page caused a player to leave.</p>
        <p>The session-end rate is ended sessions whose last page was this page, divided by ended sessions that visited it. Ongoing and incomplete sessions are excluded from the rate. Successful actions are separate from button presses. First recorded use and explicit sign-in are separate evidence.</p>
        <p>Named histories expire after 90 days. Offline activity can arrive up to 72 hours later. Unknown browser types and earlier unsplit website data are not assigned to desktop or mobile.</p>
      </details>
    </>}
  </>;
}

function PageActivity({ pages }: { pages: import('../lib/playerJourneyContract').JourneyOverviewSegment['pages'] }) {
  return <><h4>Page activity</h4><div className="activity-table-wrap" role="region" aria-label="Page activity table" tabIndex={0}><table className="activity-table" aria-label="Page activity"><thead><tr><th scope="col">Page</th><th scope="col">Players</th><th scope="col">Visits</th><th scope="col">Button presses</th><th scope="col">Median active time</th><th scope="col">Next pages</th><th scope="col">Session-end rate</th></tr></thead>
    <tbody>{pages.map(page => <tr key={page.page}><th scope="row">{pageLabel(page.page)}</th><td data-label="Players">{page.uniquePlayers}</td><td data-label="Visits">{page.views}</td><td data-label="Button presses">{page.clicks}</td><td data-label="Median active time">{page.medianActiveSeconds === null ? 'Unavailable' : formatViewTime(page.medianActiveSeconds)}</td>
      <td data-label="Next pages">{page.nextPages.length ? page.nextPages.map(next => `${pageLabel(next.page)} (${next.count})`).join(', ') : 'No next page observed'}</td>
      <td data-label="Session-end rate"><strong>{page.sessionEndRate === null ? '—' : `${Math.round(page.sessionEndRate * 10) / 10}%`}</strong><small>Last observed here: {page.endedSessions} / {page.completedSessionsVisited} ended sessions that visited this page</small></td></tr>)}</tbody></table></div></>;
}
function eventText(event: JourneyEvent) {
  if (event.kind === 'page_view') return `Viewed ${pageLabel(event.page)}`;
  if (event.kind === 'click') return `Pressed ${actionLabel(event.target)} on ${pageLabel(event.page)}`;
  if (event.kind === 'outcome') return `${actionLabel(event.target)} · ${pageLabel(event.page)}`;
  if (event.kind === 'exit') return event.reason === 'sign_out' ? 'Selected sign-out' : 'Left the player workspace';
  return `${pageLabel(event.page)} · ${formatViewTime(Math.max(0, event.endedAtMillis - event.startedAtMillis) / 1000)} active`;
}
function Session({ session, timezone }: { session: JourneySession; timezone: string }) {
  return <details className="usage-story-session"><summary><strong>{activityDate(session.startedAtMillis, timezone)}</strong> · {USAGE_CLIENT_LABELS[session.clientKind]} · {entryLabel(session.entry)} · {formatViewTime(session.activeSeconds)} active<br />
    {session.status === 'ongoing' ? 'Ongoing session' : session.status === 'incomplete' ? 'Incomplete history' : session.exit === 'sign_out' ? 'Selected sign-out' : session.exit === 'left_workspace' ? 'Left the player workspace' : `Last observed here · ${pageLabel(session.lastPage)}`}</summary>
    <p className="usage-story-path">{session.path.map(pageLabel).join(' → ') || 'Page sequence unavailable'}</p>
    <ol aria-label="Session activity">{session.events.map((event, index) => <li key={index}><time>{activityDate(event.kind === 'dwell' ? event.startedAtMillis : event.atMillis, timezone)}</time> · {eventText(event)}</li>)}</ol>
    <p>Observed outcomes: {session.outcomes.length ? session.outcomes.map(outcome => `${actionLabel(outcome.target)} (${outcome.count})`).join(', ') : 'None recorded'}</p>
  </details>;
}
