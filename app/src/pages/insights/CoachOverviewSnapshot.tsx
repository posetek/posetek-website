import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../../lib/benchmarks';
import type { CoachTestingPlayer, ExpandedInsights } from './lib/expanded';
import { COACH_TEST_LABELS } from './lib/coachFollowUp';
import { evidenceDate, measuredChange } from './lib/coachTesting';

type Selection = 'improving' | 'workouts' | 'review';
type NamedPlayer = { id: string; name: string };
const TITLES: Record<Selection, string> = { improving: 'Players improving', workouts: 'No completed workouts', review: 'Results to review' };

function TestingEvidence({ player }: { player: CoachTestingPlayer }) {
  return <div className="coach-evidence-measurements">{player.measuredTests.flatMap(test => test.metrics.filter(metric => metric.previous !== null && metric.trend !== 'unavailable').map(metric => {
    const definition = get(metric.key);
    return <div className="coach-evidence-measurement" key={`${test.drill}-${metric.key}`}>
      <div className="coach-evidence-test"><strong>{COACH_TEST_LABELS[test.drill] || test.drill}</strong><span>{definition?.label || metric.key}</span></div>
      <div className="coach-evidence-value"><span className="coach-evidence-caption">Previous</span><strong>{definition?.format(metric.previous!) || 'Unavailable'}</strong><time dateTime={test.previousTestDate!}>{test.previousTestDate ? evidenceDate(test.previousTestDate) : 'Date unavailable'}</time></div>
      <div className="coach-evidence-value"><span className="coach-evidence-caption">Latest</span><strong>{definition?.format(metric.current) || 'Unavailable'}</strong><time dateTime={test.lastTestDate!}>{test.lastTestDate ? evidenceDate(test.lastTestDate) : 'Date unavailable'}</time></div>
      <div className={`coach-evidence-change is-${metric.trend}`}><span className="coach-evidence-caption">Change</span><strong>{measuredChange(metric)}</strong></div>
    </div>;
  }))}</div>;
}

/** Only the complete, versioned overview contract supplies testing totals. */
export default function CoachOverviewSnapshot({ data, playerLink = player => `/insights?view=player&playerId=${encodeURIComponent(player.id)}` }: { data: ExpandedInsights; playerLink?: (player: { id: string }) => string }) {
  const testing = data.overview?.coachTesting?.version === 1 ? data.overview.coachTesting : null;
  const focus = data.overview?.coachFocus?.version === 1 ? data.overview.coachFocus : null;
  const [choice, setChoice] = useState<Selection | null>(null), [showAll, setShowAll] = useState(false);
  const selected = choice ?? (testing?.reviewPlayers.length ? 'review' : testing?.improvingPlayers.length ? 'improving' : 'workouts');
  const panelId = useId(), headingId = useId();
  const groups: Record<Selection, (NamedPlayer | CoachTestingPlayer)[] | undefined> = {
    improving: testing?.improvingPlayers, workouts: focus?.noCompletionPlayers, review: testing?.reviewPlayers,
  };
  const players = groups[selected];
  const dateRange = `${evidenceDate(data.period.startDate)} – ${evidenceDate(data.period.endDate)}`;
  const descriptions: Record<Selection, string> = {
    improving: testing ? `${testing.comparablePlayers} players with comparable results` : 'Testing evidence unavailable',
    workouts: 'During the reporting period',
    review: 'At least one measured decline',
  };
  const empty: Record<Selection, string> = {
    improving: testing?.comparablePlayers ? 'No players have improved without a decline in another measured metric.' : 'No comparable results yet. Players need measurements on two separate test dates.',
    workouts: data.roster.filtered ? 'Every player in this selection has a saved workout completion.' : 'No players in this selection. Adjust the team or filters to see your roster.',
    review: testing?.comparablePlayers ? 'No measured declines in this selection.' : 'No comparable results yet. Players need measurements on two separate test dates.',
  };
  return <section className="coach-overview-snapshot" aria-label="Team snapshot">
    <header className="coach-overview-heading"><h2>Team snapshot</h2></header>
    <div className="coach-overview-selectors" role="group" aria-label="Explore team snapshot">
      {(['improving', 'workouts', 'review'] as const).map(key => <button key={key} type="button" className={`coach-overview-selector is-${key}`} aria-pressed={selected === key} aria-controls={panelId} onClick={() => { setChoice(key); setShowAll(false); }}>
        <span className="coach-overview-label">{TITLES[key]}</span>
        <strong className={`coach-overview-number${groups[key] ? '' : ' is-unavailable'}`}>{groups[key]?.length ?? 'Unavailable'}</strong>
        <span className="coach-overview-support">{descriptions[key]}</span>
      </button>)}
    </div>
    <section className={`coach-overview-evidence is-${selected}`} id={panelId} aria-labelledby={headingId}>
      <header><div><h3 id={headingId}>{TITLES[selected]}</h3><p>{selected === 'workouts' ? `Reporting period · ${dateRange}` : `Latest known results · through ${evidenceDate(testing?.asOfDate || data.period.endDate)}`}</p></div>{players && <span className="coach-overview-count">{players.length} {players.length === 1 ? 'player' : 'players'}</span>}</header>
      {!players ? <p className="coach-overview-empty">Unavailable. Refresh to request the latest {selected === 'workouts' ? 'workout completions' : 'testing evidence'}.</p>
        : !players.length ? <p className="coach-overview-empty">{empty[selected]}</p>
        : <ul className="coach-evidence-players">{(showAll ? players : players.slice(0, 5)).map(player => <li key={player.id}>
          <div className="coach-evidence-player"><Link to={playerLink(player)}>{player.name || 'Player'}<span aria-hidden="true">↗</span></Link>
            {'status' in player && <span className={`coach-evidence-status is-${player.status}`}>{player.status === 'mixed' ? 'Mixed results' : player.status === 'up' ? 'Improving' : 'Review decline'}</span>}
          </div>
          {'measuredTests' in player ? <TestingEvidence player={player} /> : <p className="coach-evidence-workout">No saved personal, assigned or extra workout completions.</p>}
        </li>)}</ul>}
      {players && players.length > 5 && <button type="button" className="coach-overview-show-all" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer players' : `Show all ${players.length}`}</button>}
    </section>
    <details className="coach-overview-method"><summary>How this is measured</summary><div>
      <p>Testing compares the same measured metrics on each test’s latest two qualified dates through {evidenceDate(testing?.asOfDate || data.period.endDate)}, in {data.period.timeZone}. These dates may be older than the reporting period. The best qualified value for each metric on each date is used.</p>
      <p>Players improving have at least one gain and no declines across their comparable tests. Any decline puts a player in Results to review; gains and declines together are labeled Mixed results. Unchanged results count toward comparable players. Values are compared at the precision shown.</p>
      <p>First tests, missing or incomparable measurements, duplicates, failed tests and future observations cannot count as a gain or decline. No completed workouts means zero saved personal, assigned or extra completions during {dateRange}.</p>
      <p>Totals include the full reporting roster after team and player filters. Name search and roster pages do not change these totals.</p>
    </div></details>
  </section>;
}
