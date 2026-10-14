import { get } from '../../../lib/benchmarks';
import type { CoachMeasuredTest } from './expanded';

/** The roster and preview use measured comparisons, never legacy D1 statuses. */
export function testingOutcome(tests: CoachMeasuredTest[], asOfDate = '9999-12-31') {
  const comparable = tests.filter(test => test.previousTestDate && test.lastTestDate
    && test.previousTestDate < test.lastTestDate && test.lastTestDate <= asOfDate)
    .map(test => ({ ...test, metrics: test.metrics.filter(metric => metric.previous !== null && Number.isFinite(metric.previous)
      && metric.previous > 0 && Number.isFinite(metric.current) && metric.current > 0 && ['up', 'down', 'same'].includes(metric.trend)) }))
    .filter(test => test.metrics.length);
  const metrics = comparable.flatMap(test => test.metrics);
  const up = metrics.some(metric => metric.trend === 'up'), down = metrics.some(metric => metric.trend === 'down');
  return { measuredTests: comparable, status: down && up ? 'mixed' as const : down ? 'down' as const : up ? 'up' as const : comparable.length ? 'same' as const : 'unavailable' as const };
}

export function evidenceDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Subtract displayed values so the change agrees with the precision and units
 * of the two visible measurements (including metric-to-imperial conversions). */
export function measuredChange(metric: CoachMeasuredTest['metrics'][number]) {
  const definition = get(metric.key);
  if (!definition || definition.placeholder || metric.previous === null || !Number.isFinite(metric.previous) || !Number.isFinite(metric.current)) return 'Unavailable';
  const current = definition.format(metric.current), previous = definition.format(metric.previous);
  const delta = Number.parseFloat(current) - Number.parseFloat(previous);
  if (delta === 0) return 'Unchanged';
  const precision = current.match(/\.(\d+)/)?.[1].length ?? 0;
  const unit = current.replace(/^[\d.-]+\s*/, '');
  const time = metric.key.toLowerCase().includes('time'), speed = metric.key.toLowerCase().includes('speed');
  const direction = time ? delta < 0 ? 'faster' : 'slower' : speed ? delta > 0 ? 'faster' : 'slower' : delta > 0 ? 'higher' : 'lower';
  return `${Math.abs(delta).toFixed(precision)} ${unit} ${direction}`;
}
