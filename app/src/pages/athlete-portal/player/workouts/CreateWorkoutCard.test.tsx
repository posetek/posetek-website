import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CreateWorkoutCard from './CreateWorkoutCard';

const render = (props: Partial<Parameters<typeof CreateWorkoutCard>[0]> = {}) =>
  renderToStaticMarkup(<CreateWorkoutCard initialMinutes={45} onBuild={() => {}} {...props} />);
const order = (html: string, words: string[]) => words.map(w => html.indexOf(w)).every((index, i, all) => index >= 0 && (i === 0 || index > all[i - 1]));

describe('CreateWorkoutCard', () => {
  it('asks where (soccer field chosen first), the goal, minutes and energy, then one button', () => {
    const html = render();
    expect(order(html, ['Soccer field', 'Gym', 'At home', 'Goal?', '<strong>45</strong> minutes', 'Energy', 'Low', 'Normal', 'High', 'Build my workout'])).toBe(true);
    expect(html).toContain('data-place="field" aria-pressed="true"');
    // Never asked: the ball, equipment.
    expect(html).not.toMatch(/ball\?|equipment/i);
  });
  it('waits for the answers before the button works', () => {
    expect(render()).toMatch(/data-action="build-workout" disabled=""/);
  });
  it('stays visible but disabled, with its short reason, for a viewer who cannot build', () => {
    const html = render({ disabledReason: 'Athlete or admin only' });
    expect(html).toContain('Build my workout');
    expect(html).toContain('Athlete or admin only');
  });
});
