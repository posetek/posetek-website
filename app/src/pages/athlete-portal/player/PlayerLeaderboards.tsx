import { useEffect, useState } from 'react';
import { auth, cloud } from '../../../lib/firebase';
import { metricValue, resultUsable } from '../../../lib/result-values';
import { fullName } from '../lib/metrics';
import { drillKey } from './scoring';
import type { Row } from './execution';
import './player-leaderboards.css';

export const PLAYER_BOARDS = [
  { key: 'changeOfDirection', label: 'Agility', metric: 'totalTime', lower: true, factor: 1, unit: 's', precision: 2, direction: 'Lower time is better', description: 'Change direction and return without the ball.' },
  { key: 'sprint', label: 'Sprint', metric: 'totalTime', lower: true, factor: 1, unit: 's', precision: 2, direction: 'Lower time is better', description: 'Complete the sprint course as quickly as possible.' },
  { key: 'jump', label: 'Vertical jump', metric: 'jumpHeight', lower: false, factor: 39.37007874, unit: 'in', precision: 1, direction: 'Higher is better', description: 'How high you jump from a standing start.' },
  { key: 'broadJump', label: 'Broad jump', metric: 'broadJumpDistance', lower: false, factor: 3.28084, unit: 'ft', precision: 1, direction: 'Farther is better', description: 'How far you jump forward from a standing start.' },
  { key: 'dribbling', label: 'Dribbling', metric: 'totalTime', lower: true, factor: 1, unit: 's', precision: 2, direction: 'Lower time is better', description: 'Complete the out-and-back course with the ball.' },
  { key: 'shooting', label: 'Shooting', metric: 'velocity', lower: false, factor: 2.23694, unit: 'mph', precision: 1, direction: 'Higher ball speed is better', description: 'Ball speed measures the strike, not shooting accuracy.' },
] as const;
type Board = typeof PLAYER_BOARDS[number];
type Course = { field: string; distance: number };
type Candidate = { playerId: string; name: string; value: number; at: number | null; repId: string; course: Course | null };
export type LeaderboardGroup = { id: string; field: string; min: number; max: number; label: string; ranked: boolean; candidates: Candidate[] };
export type LeaderboardRow = { id: string; name: string; value: number; at: number | null; rank: number | null; tied: boolean };
const boardFor = (key: string) => PLAYER_BOARDS.find(board => board.key === key);
const positive = (rep: Row, field: string) => { const value = metricValue(rep, field); return value !== null && value > 0 ? value : null; };
const recordedAt = (rep: Row) => typeof rep.createdAtMillis === 'number' && rep.createdAtMillis > 0 && Number.isFinite(new Date(rep.createdAtMillis).getTime()) ? rep.createdAtMillis : null;
const displayed = (value: number, board: Board) => Number(value.toFixed(board.precision));
const valueText = (value: number, board: Board) => `${value.toFixed(board.precision)} ${board.unit}`;
const dateText = (millis: number | null) => millis === null ? null : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(millis));

function courseFor(rep: Row, key: string): Course | null {
  // The server derives this field from identity-matched processing geometry.
  // Tracked distance/totalDistance are never a course definition.
  const recorded = positive(rep, 'courseDistanceMeters');
  if (recorded !== null) return { field: key === 'sprint' ? 'courseDistanceMeters' : 'markerDistance', distance: recorded };
  return null;
}
function courseLabel(group: Pick<LeaderboardGroup, 'field' | 'min' | 'max'>) {
  const low = group.min.toFixed(1), high = group.max.toFixed(1);
  const distance = low === high ? low : `${low}–${high}`;
  return group.field === 'markerDistance' ? `Markers ${distance} m apart` : `Recorded course ${distance} m`;
}

/** Like the existing personal comparison, distance groups allow at most 5% variation.
 * The complete group's min/max must match; neighboring values cannot chain courses together.
 * This is a distance comparison, not a claim that a shared test protocol was recorded.
 */
export function leaderboardGroups(players: Row[], key: string): LeaderboardGroup[] {
  const board = boardFor(key);
  if (!board) return [];
  const candidates: Candidate[] = players.flatMap(player => (Array.isArray(player.reps) ? player.reps : [])
    .filter((rep: Row) => resultUsable(rep) && drillKey(rep) === key)
    .flatMap((rep: Row) => {
      const raw = positive(rep, board.metric);
      return raw === null ? [] : [{ playerId: player.id, name: fullName(player), value: raw * board.factor,
        at: recordedAt(rep), repId: String(rep.id || ''), course: board.lower ? courseFor(rep, key) : null }];
    }));
  if (!board.lower) return [{ id: 'all', field: '', min: 0, max: 0, label: 'All recorded results', ranked: true, candidates }];
  const groups: LeaderboardGroup[] = [];
  const known = candidates.filter(candidate => candidate.course).sort((a, b) => a.course!.field.localeCompare(b.course!.field) || a.course!.distance - b.course!.distance);
  for (const candidate of known) {
    const { field, distance } = candidate.course!;
    const prior = groups.at(-1);
    if (prior?.field === field && (distance - prior.min) / distance <= .05) {
      prior.max = distance; prior.candidates.push(candidate); prior.label = courseLabel(prior);
    } else {
      const group = { id: `${field}:${distance}`, field, min: distance, max: distance, label: '', ranked: true, candidates: [candidate] };
      group.label = courseLabel(group); groups.push(group);
    }
  }
  const unknown = candidates.filter(candidate => !candidate.course);
  if (unknown.length) groups.push({ id: 'unknown', field: '', min: 0, max: 0, label: 'Distance not recorded', ranked: false, candidates: unknown });
  return groups;
}

export function preferredLeaderboardGroup(groups: LeaderboardGroup[], playerId: string): string | null {
  const own = groups.filter(group => group.ranked).flatMap(group => group.candidates.filter(row => row.playerId === playerId).map(row => ({ group, row })))
    .sort((a, b) => (b.row.at || 0) - (a.row.at || 0));
  return own[0]?.group.id || groups.find(group => group.ranked)?.id || groups[0]?.id || null;
}

export function leaderboardRows(group: LeaderboardGroup | undefined, key: string): LeaderboardRow[] {
  const board = boardFor(key);
  if (!group || !board) return [];
  const best = new Map<string, Candidate>();
  for (const candidate of group.candidates) {
    const prior = best.get(candidate.playerId);
    const newer = prior && (candidate.at || 0) > (prior.at || 0);
    const better = prior && (board.lower ? candidate.value < prior.value : candidate.value > prior.value);
    if (!prior || (group.ranked ? better || (candidate.value === prior.value && newer) : newer)) best.set(candidate.playerId, candidate);
  }
  const rows = [...best.values()].sort((a, b) => group.ranked
    ? (board.lower ? displayed(a.value, board) - displayed(b.value, board) : displayed(b.value, board) - displayed(a.value, board)) || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId)
    : a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  let rank = 0;
  return rows.map((row, index) => {
    const value = displayed(row.value, board);
    if (!index || displayed(rows[index - 1].value, board) !== value) rank = index + 1;
    return { id: row.playerId, name: row.name, value: row.value, at: row.at, rank: group.ranked ? rank : null,
      tied: group.ranked && rows.some(other => other.playerId !== row.playerId && displayed(other.value, board) === value) };
  });
}

/** Kept as the pure entry point used by player scoring regression tests. */
export function playerStandings(players: Row[], key: string, _dataset?: Row) {
  const groups = leaderboardGroups(players, key);
  return leaderboardRows(groups.find(group => group.ranked), key);
}

type LoadState = { status: 'loading' | 'ready' | 'error'; players: Row[]; error: string; teamName?: string };
const loading = (): LoadState => ({ status: 'loading', players: [], error: '' });
type TeamScope = { playerId: string; teamId?: string; organizationId?: string };

/** A late response cannot repopulate teammate names after sign-out or a scope change. */
export function loadTeamStandings(scope: TeamScope, receive: (state: LoadState) => void): () => void {
  let active = true;
  const uid = auth.currentUser?.uid;
  receive(loading());
  if (!uid) { receive({ status: 'error', players: [], error: 'Sign in again to see your team results.' }); return () => {}; }
  let timer: ReturnType<typeof setTimeout>;
  const stopAuth = auth.onAuthStateChanged(user => {
    if (active && user?.uid !== uid) {
      active = false; clearTimeout(timer);
      receive({ status: 'error', players: [], error: 'Your account changed. Reopen Leaderboards after signing in.' });
    }
  });
  timer = setTimeout(() => {
    if (active) { active = false; receive({ status: 'error', players: [], error: 'Your team results are taking longer than expected. Please try again.' }); }
  }, 20000);
  void cloud.httpsCallable('getTeamLeaderboard')({}).then(response => {
    if (!active || auth.currentUser?.uid !== uid) return;
    const data = response.data as Row;
    if (data.playerId !== scope.playerId || (scope.teamId && data.teamId !== scope.teamId) || (scope.organizationId && data.organizationId !== scope.organizationId)) {
      receive({ status: 'error', players: [], error: 'Your team assignment changed. Reload your profile to see the current team.' });
    } else if (!Array.isArray(data.athletes)) {
      receive({ status: 'error', players: [], error: 'Your team results could not be loaded. Please try again.' });
    } else receive({ status: 'ready', players: data.athletes, error: '', ...(typeof data.teamName === 'string' && data.teamName.trim() ? { teamName: data.teamName.trim().slice(0, 120) } : {}) });
    clearTimeout(timer);
  }).catch(error => {
    if (!active || auth.currentUser?.uid !== uid) return;
    clearTimeout(timer);
    const code = String(error?.code || '');
    receive({ status: 'error', players: [], error: code.includes('failed-precondition') ? 'Ask your coach to check your team assignment, then try again.' : 'We could not load your team results. Please try again.' });
  });
  return () => { active = false; clearTimeout(timer); stopAuth(); };
}

function previewPlayers(playerId: string, athlete: Row, reps: Row[]) {
  return [athlete, { id: 'preview-peer-a', firstName: 'Alex', lastName: 'Rivera' }, { id: 'preview-peer-b', firstName: 'Sam', lastName: 'Lee' }].map((player, i) => ({ ...player,
    id: i === 0 ? playerId : player.id, reps: reps.map(rep => ({ ...rep,
      ...(['sprint', 'changeOfDirection', 'dribbling'].includes(drillKey(rep)) ? { courseDistanceMeters: drillKey(rep) === 'sprint' ? 20 : 5 } : {}),
      totalTime: rep.totalTime ? rep.totalTime * (1 + i * .07) : undefined,
      velocity: rep.velocity ? rep.velocity * (1 - i * .04) : undefined,
    })),
  }));
}

export function LeaderboardResults({ players, playerId, selected, groupId, onGroupChange }: { players: Row[]; playerId: string; selected: string; groupId: string | null; onGroupChange: (value: string) => void }) {
  const board = boardFor(selected)!;
  const groups = leaderboardGroups(players, selected);
  const chosen = groups.find(group => group.id === groupId) || groups.find(group => group.id === preferredLeaderboardGroup(groups, playerId));
  const rows = leaderboardRows(chosen, selected), own = rows.find(row => row.id === playerId);
  const mean = chosen?.ranked && rows.length ? rows.reduce((sum, row) => sum + row.value, 0) / rows.length : null;
  const otherPlayers = players.filter(player => !rows.some(row => row.id === player.id));
  const date = own && dateText(own.at);
  return <>
    <div className="leaderboard-test-heading"><h2>{board.label}</h2><p>{board.description}</p><strong>{board.direction}</strong></div>
    {board.lower && groups.length > 0 && <div className="leaderboard-course">{groups.length === 1 ? <p className="leaderboard-course-label">{chosen?.label}</p> : <><label>Compare recorded distance<select value={chosen?.id || ''} onChange={event => onGroupChange(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
      <p className="muted-copy">Compare runs at similar recorded distances.</p></>}</div>}
    {!players.length ? <section className="portal-card"><h2>No team results yet</h2><p>Your coach can check your team assignment and saved tests.</p></section> : <>
      <section className="portal-card leaderboard-own" aria-label="Your result">
        <p className="eyebrow">Your place in this test</p>
        {own?.rank != null ? <p className="leaderboard-position"><strong>{own.tied ? 'Tied ' : ''}{own.rank}</strong><span>of {rows.length} {rows.length === 1 ? 'player' : 'players'} with a result</span></p>
          : <p className="leaderboard-unranked">{own ? 'Result saved · not ranked' : 'Not ranked yet'}</p>}
        {own ? <><p className="leaderboard-own-value">{valueText(own.value, board)} <span>{chosen?.ranked ? 'Your best result' : 'Latest recorded result'}</span></p>{date && <p className="muted-copy">Recorded {date}</p>}</>
          : <p>No result is available for you in this comparison. Missing results are not a score of zero.</p>}
        {chosen && !chosen.ranked && <p>We need the test distance before these times can be compared fairly.</p>}
        {mean !== null && <div className="leaderboard-average"><span>Team average <small>of these {rows.length} {rows.length === 1 ? 'player’s best result' : 'players’ best results'}</small></span><strong>{valueText(mean, board)}</strong></div>}
      </section>
      <section className="portal-card leaderboard-table-card"><h2>{chosen?.ranked === false ? 'Saved results' : 'Team results'}</h2>
        <p className="muted-copy">{chosen?.ranked === false ? 'Latest results are listed by name. Distance is missing, so no rank is assigned.' : `Each player’s best available result${board.lower ? ' for this distance group' : ''}.`}</p>
        <table className="leaderboard-table"><caption>{board.label}{chosen ? ` · ${chosen.label}` : ''}</caption><thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col">Result</th></tr></thead><tbody>
          {rows.map(row => <tr key={row.id} className={row.id === playerId ? 'leaderboard-is-you' : undefined}><td>{row.rank === null ? '—' : <>{row.rank}{row.tied && <small>Tied</small>}</>}</td><th scope="row">{row.name}{row.id === playerId && <span className="leaderboard-you">You</span>}</th><td><strong>{valueText(row.value, board)}</strong>{dateText(row.at) && <small>{dateText(row.at)}</small>}</td></tr>)}
          {otherPlayers.map(player => <tr key={player.id} className={player.id === playerId ? 'leaderboard-is-you' : undefined}><td>—</td><th scope="row">{fullName(player)}{player.id === playerId && <span className="leaderboard-you">You</span>}</th><td className="leaderboard-missing">{groups.some(group => group.candidates.some(candidate => candidate.playerId === player.id)) ? 'No result in this distance group' : 'No result available'}</td></tr>)}
        </tbody></table>
      </section>
    </>}
    <details className="leaderboard-method"><summary>How these places are calculated</summary><p>Each player contributes their best available result in this comparison. Results marked unavailable do not earn a place. Ties share a place at the precision shown, and the next place accounts for all tied players. The team average uses these players’ best results.</p>{board.lower && <p>Times are grouped by the same recorded distance field, within 5%. Sprint comparisons use the recorded course distance. Agility and dribbling use marker spacing. Tracked travel distance does not define a course. Different course layouts may still affect results. When distance is missing, only the latest saved time is shown, without a rank or team average.</p>}</details>
    <p className="muted-copy leaderboard-explainer">Rankings compare saved test results. Your profile and workouts support your own progress.</p>
  </>;
}

export default function PlayerLeaderboards({ playerId, preview, reps, athlete }: { playerId: string; preview: boolean; reps: Row[]; athlete: Row; dataset: Row }) {
  const scope = { playerId, teamId: athlete.teamId, organizationId: athlete.organizationId };
  const scopeKey = JSON.stringify([playerId, athlete.teamId || '', athlete.organizationId || '', preview]);
  const [loaded, setLoaded] = useState<{ scope: string; state: LoadState }>({ scope: scopeKey, state: loading() });
  const [selected, setSelected] = useState<string>('changeOfDirection'), [groupId, setGroupId] = useState<string | null>(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    setGroupId(null);
    if (preview) return;
    return loadTeamStandings(scope, state => setLoaded({ scope: scopeKey, state }));
  // Scope values are captured together so old names disappear before the next effect runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, retry]);
  const state = preview ? { status: 'ready', players: previewPlayers(playerId, athlete, reps), error: '' } : loaded.scope === scopeKey ? loaded.state : loading();
  return <section className="player-leaderboards"><p className="eyebrow">{'teamName' in state && state.teamName ? state.teamName : 'Your team'}</p><h1>Leaderboards</h1><p className="leaderboard-intro">See where your results sit within your team, one test at a time.</p>
    <nav className="leaderboard-tests" aria-label="Leaderboard tests">{PLAYER_BOARDS.map(board => <button key={board.key} aria-pressed={selected === board.key} onClick={() => { setSelected(board.key); setGroupId(null); }}>{board.label}</button>)}</nav>
    {state.status === 'error' ? <section className="portal-card"><h2>Team results unavailable</h2><p role="alert">{state.error}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></section>
      : state.status === 'loading' ? <section className="portal-card" role="status"><p>Loading your team results…</p></section>
        : <LeaderboardResults players={state.players} playerId={playerId} selected={selected} groupId={groupId} onGroupChange={setGroupId} />}
  </section>;
}
