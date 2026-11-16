import { Link } from 'react-router-dom';
import type { ExpandedInsights, ExpandedReportSummary } from '../../insights/lib/expanded';
import type { ExpandedRequest } from '../../insights/lib/expandedQuery';
import { activityDate } from '../lib/adminActivityPresentation';
import { USAGE_CLIENTS, USAGE_CLIENT_LABELS, USAGE_GROUP_LABELS, usageChangeSummary, usageShare } from '../lib/usageStory';
import type { UsageCohortGroup, UsageClient } from '../lib/usageStory';
import './usage-story.scss';

const groups: UsageCohortGroup[] = ['active', 'retained', 'added', 'new', 'reactivated', 'weekly_not_yet_returned', 'repeat_retained', 'repeat_returned_once', 'repeat_not_yet_returned', 'unknown'];
const number = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString('en-US');
export default function WeeklyParticipation({ data, request, busy, onChange, journeyLink, onFirstPage, onNextPage }: {
  data: ExpandedInsights | ExpandedReportSummary; request: ExpandedRequest; busy?: boolean;
  onChange(patch: Partial<ExpandedRequest>): void; journeyLink(playerId: string): string;
  onFirstPage(): void; onNextPage(): void;
}) {
  const report = data.adminReporting?.usageCohorts;
  const client = request.usageClientKind || 'desktop_web', group = request.usageCohortGroup || 'active';
  const exact = 'players' in data ? data : null;
  const segment = report?.segments[client];
  return <section className="usage-story activity-card" aria-labelledby="weekly-participation-title" aria-busy={Boolean(busy)}>
    <div className="activity-section-heading"><div><h2 id="weekly-participation-title">Weekly participation</h2><p className="activity-note">Players’ own recorded use · separate from historical activity on player profiles, which may include linked parents.</p></div></div>
    <label className="usage-story-platform">Platform<select aria-label="Participation platform" value={client} onChange={event => onChange({ usageClientKind: event.target.value as UsageClient, cursor: '', page: 0 })}>
      {USAGE_CLIENTS.map(key => <option key={key} value={key}>{USAGE_CLIENT_LABELS[key]}</option>)}
    </select></label>
    {!report || !segment ? <p role="status">Weekly participation tracking is not available in this report yet. Refresh reporting to check again. Existing usage totals remain above.</p> : <>
      <p className="usage-story-period"><strong>Week to date · {report.windows.current.startDate} – {report.windows.current.endDate}</strong><br />Compared with the whole previous week · {report.windows.previous.startDate} – {report.windows.previous.endDate} · {request.timezone}</p>
      <p className="activity-note">Continuous coverage start: {report.coverageStartedAtMillis === null ? 'not confirmed' : activityDate(report.coverageStartedAtMillis, request.timezone)}. {client === 'ios' ? `Verified iOS builds for this breakdown: ${report.supportedIOSBuilds?.length ? report.supportedIOSBuilds.join(', ') : 'none recorded yet'}. Earlier supported own-player usage may contribute; missing install coverage is unmeasured.` : 'Older website activity remains unsplit. Phone and tablet browsers are Mobile website.'}</p>
      {(segment.current.status !== 'available' || segment.previous.status !== 'available') && <p role="status" className="form-message">Partial coverage. No recorded activity does not establish absence. The comparison may change as offline activity arrives.</p>}
      <div className="usage-story-composition" aria-label="Weekly user composition">{([
        ['new', segment.current.newPlayers], ['existing', segment.current.existingPlayers], ['unknown_history', segment.current.unknownHistoryPlayers],
      ] as const).map(([key, value]) => <button type="button" key={key} disabled={busy || value === null} className="usage-story-composition-card" aria-pressed={group === key}
        onClick={() => onChange({ usageCohortGroup: key, cursor: '', page: 0 })}>
        <span>{USAGE_GROUP_LABELS[key]}</span><strong>{number(value)}</strong><span>{usageShare(value, segment.current.activePlayers)} of {number(segment.current.activePlayers)} weekly active players</span>
      </button>)}</div>
      <p className="usage-story-explanation">{usageChangeSummary(segment)}</p>
      <div className="usage-story-groups" role="group" aria-label="Participation groups">{groups.map(key => <button type="button" className="quiet-button" key={key} disabled={busy || segment.groups[key] === null} aria-pressed={group === key}
        onClick={() => onChange({ usageCohortGroup: key, cursor: '', page: 0 })}>{USAGE_GROUP_LABELS[key]} <strong>{number(segment.groups[key])}</strong></button>)}</div>
      <h3>{USAGE_GROUP_LABELS[group]}</h3>
      {!exact ? <p role="status">Loading the selected players…</p> : <>
        {exact.players.length ? <div className="activity-table-wrap"><table className="activity-table" aria-label="Weekly participation players"><thead><tr><th scope="col">Player</th><th scope="col">This week · days</th><th scope="col">Last week · days</th><th scope="col">History</th><th scope="col">Last recorded activity</th><th scope="col">Journey</th></tr></thead>
          <tbody>{exact.players.map(player => { const row = player.adminReporting?.usage.cohort?.[client];
            return <tr key={player.id}><th scope="row">{`${player.firstName} ${player.lastName}`.trim() || 'Player'}<small>{player.teamName || 'Unassigned'}</small></th>
              <td data-label="This week · days">{row?.activeDays ?? 'Unknown'}</td><td data-label="Last week · days">{row?.previousActiveDays ?? 'Unknown'}</td>
              <td data-label="History">{row?.history === 'new' ? 'First recorded use' : row?.history === 'existing' ? 'Previously active' : row?.history === 'inactive' ? 'No recorded activity this week' : 'History unknown'}</td>
              <td data-label="Last recorded activity">{row?.lastActivityAtMillis ? activityDate(row.lastActivityAtMillis, request.timezone) : 'Not recorded'}</td>
              <td data-label="Journey"><Link to={journeyLink(player.id)}>View journey</Link></td></tr>;
          })}</tbody></table></div> : <p>No players match this participation group in the recorded coverage.</p>}
        <nav className="activity-pagination" aria-label="Participation player pages"><span>{exact.pagination.total} matching players · page {request.page + 1}. Counts cover the full selection.</span><div>
          <button type="button" className="quiet-button" disabled={busy || request.page === 0} onClick={onFirstPage}>First page</button>
          <button type="button" className="quiet-button" disabled={busy || !exact.pagination.nextCursor} onClick={onNextPage}>Next</button>
        </div></nav>
      </>}
      <details className="activity-method"><summary>Participation definitions</summary><p>Weekly active means positive recorded player activity. Repeat means activity on at least two distinct local days. Multiple visits or devices on one day count as one day.</p>
        <p>First recorded use is across PoseTek, not first use of this platform. Uncertain earlier history stays unknown. A current-week absence is provisional, not confirmed churn. Each platform counts a player once, so platform counts overlap and must not be added.</p>
        <p>Unknown browser type: {number(report.segments.unknown_web.current.activePlayers)} active players. All platforms: {number(report.segments.all.current.activePlayers)} distinct players. These are separate from older unsplit website totals.</p>
      </details>
    </>}
  </section>;
}
