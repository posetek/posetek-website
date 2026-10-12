import type { ExpandedPlayer } from './lib/expanded';
import { COACH_TEST_LABELS } from './lib/coachFollowUp';
import { get } from '../../lib/benchmarks';
import { summaryDateLabel } from './lib/coachPlayerSummary';

export default function CoachMeasuredTests({ performance }: { performance?: ExpandedPlayer['performance'] }) {
  const tests = performance?.coachFocus?.version === 1 ? performance.coachFocus.measuredTests : null;
  return <section className="coach-measured-tests" aria-label="Measured testing results">
    <h3>Latest measured tests</h3>
    <p className="insights-note">Each test compares its latest two test dates through the selected end. Lower times and ball distance are better; higher speed and jumps are better. A decline is a change to review, not a diagnosis.</p>
    {!tests ? <p>Testing summary unavailable. Refresh to check the latest results.</p> : <div className="coach-player-test-grid">{tests.map(test => {
      const label = test.status === 'down' ? 'Down' : test.status === 'mixed' ? 'Mixed · review' : test.status === 'up' ? 'Improving' : test.status === 'same' ? 'Unchanged' : test.status === 'notTested' ? 'Not tested' : test.status === 'noPriorTest' ? 'First test' : 'Not comparable';
      return <div className={`coach-player-test${test.status === 'down' || test.status === 'mixed' ? ' is-down' : ''}`} key={test.drill}>
        <div className="coach-player-test-label"><strong>{COACH_TEST_LABELS[test.drill] || test.drill}</strong><span>{label}</span></div>
        <p className="coach-test-dates">{test.lastTestDate ? `${test.previousTestDate ? `${summaryDateLabel(test.previousTestDate, true)} → ` : ''}${summaryDateLabel(test.lastTestDate, true)}` : 'No qualified result recorded'}</p>
        {test.metrics.length > 0 && <dl className="coach-measured-values">{test.metrics.map(metric => {
          const definition = get(metric.key);
          if (!definition) return null;
          return <div key={metric.key}><dt>{definition.label}</dt><dd>{metric.previous !== null && <span>{definition.format(metric.previous)} → </span>}<strong>{definition.format(metric.current)}</strong><small>{metric.trend === 'unavailable' ? 'No comparable prior result' : metric.trend === 'down' ? 'Down' : metric.trend === 'up' ? 'Improved' : 'Unchanged'}</small></dd></div>;
        })}</dl>}
      </div>;
    })}</div>}
  </section>;
}
