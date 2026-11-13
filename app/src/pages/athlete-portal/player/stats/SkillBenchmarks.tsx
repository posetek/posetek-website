import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import ProvisionalEstimateNote from '../../../../components/athlete-stats/ProvisionalEstimateNote';
import { provisionalScore } from '../../../../lib/provisional-estimates';
import type { ProvisionalEstimate } from '../../../../lib/provisional-estimates';
import type { PlayerProfile } from '../scoring';
import { RADAR_CEILING, RADAR_ORDER, nearestRadarAxis, radarAngle, radarPoint, radarRadius } from './stats-format';

const HEIGHT = 258;
/** The card's inner width on a 390 px phone; replaced by the measured width once mounted. */
const DEFAULT_WIDTH = 324;

type Axis = { key: string; label: string; score: number | null };

/** The five axes in the app's order, with the score each one plots. */
export function radarAxes(profile: PlayerProfile): Axis[] {
  return RADAR_ORDER.map(key => {
    const axis = profile.axes.find(item => item.key === key)!;
    return { key, label: axis.label, score: axis.score };
  });
}

/** Opens on the weakest scored axis (`rankedAxes.last`), else Speed. */
export function defaultRadarAxis(axes: Axis[]): string {
  const scored = axes.filter(axis => axis.score !== null).sort((a, b) => b.score! - a.score!);
  return scored[scored.length - 1]?.key ?? 'speed';
}

const scoreText = (score: number | null) => score === null ? '—' : score.toFixed(0);

/**
 * "Skill benchmarks" (the app's `V4ProfileStatsView` top half): the legend and the radar with the
 * D1 reference in one card, then the reference caption. Tapping a label or a sector selects that
 * axis, as the app does; the V4 layout has no detail panel under it.
 */
export default function SkillBenchmarks({ profile, estimates = [] }: { profile: PlayerProfile; estimates?: ProvisionalEstimate[] }) {
  const axes = radarAxes(profile), count = axes.length;
  const [selected, setSelected] = useState(() => defaultRadarAxis(axes));
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const frame = useRef<HTMLDivElement>(null);
  // As in the app, the default is chosen once, when the profile first has data.
  const initialized = useRef(profile.totalReps > 0);
  useEffect(() => {
    if (initialized.current || profile.totalReps === 0) return;
    initialized.current = true;
    setSelected(defaultRadarAxis(radarAxes(profile)));
  }, [profile]);
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => { if (element.clientWidth > 0) setWidth(element.clientWidth); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // A missing axis can carry a coach-confirmed estimate. The app has no estimates; the web keeps
  // them visible as a hollow marker and their note, only while one applies.
  const estimated = Object.fromEntries(estimates.flatMap(entry => {
    if (profile.axes.find(axis => axis.key === entry.axis)?.score !== null) return [];
    const metric = profile.metrics.find(item => item.key === (entry.drill === 'dribbling' ? 'dribbleTotalTime' : 'codTotalTime'));
    const score = provisionalScore(entry, metric?.reference ?? null);
    return score === null ? [] : [[entry.axis, score] as const];
  })) as Record<string, number>;
  const cx = width / 2, cy = HEIGHT / 2, radius = radarRadius(width, HEIGHT);
  const point = (index: number, ratio: number) => radarPoint(cx, cy, radius, index, count, ratio);
  const polygon = (ratio: number) => axes.map((_, index) => { const p = point(index, ratio); return `${p.x},${p.y}`; }).join(' ');
  const ratioFor = (score: number) => Math.min(Math.max(score, 0), RADAR_CEILING) / RADAR_CEILING;
  const recorded = axes.filter(axis => axis.score !== null);
  const athlete = axes.flatMap((axis, index) => axis.score === null ? [] : [point(index, ratioFor(axis.score))]);
  const selectSector = (event: MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = nearestRadarAxis(event.clientX - box.left - cx, event.clientY - box.top - cy, count);
    if (index !== null) setSelected(axes[index].key);
  };
  return <section className="stats-benchmarks" aria-labelledby="stats-benchmarks-title">
    <h2 id="stats-benchmarks-title" className="stats-section-title">Skill benchmarks</h2>
    <div className="v4-card stats-radar-card">
      <div className="stats-radar-legend">
        <span>SKILL MAP</span><span className="stats-radar-count">{recorded.length}/{count} recorded</span>
        <span className="stats-radar-key"><i className="you" />You</span><span className="stats-radar-key"><i className="d1" />D1</span>
      </div>
      <div className="stats-radar" ref={frame} style={{ height: HEIGHT }}>
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true" onClick={selectSector}>
          {[0.25, 0.5, 0.75, 1].map(ratio => <polygon key={ratio} points={polygon(ratio)} className="stats-radar-grid" />)}
          {axes.map((axis, index) => { const end = point(index, 1); return <line key={axis.key} x1={cx} y1={cy} x2={end.x} y2={end.y}
            className={`stats-radar-spoke${axis.key === selected ? ' selected' : ''}${axis.score === null ? ' empty' : ''}`} />; })}
          <polygon points={polygon(100 / RADAR_CEILING)} className="stats-radar-reference" />
          {recorded.length >= 3 && <polygon points={athlete.map(p => `${p.x},${p.y}`).join(' ')} className="stats-radar-athlete" />}
          {axes.map((axis, index) => {
            if (axis.score === null) {
              const estimate = estimated[axis.key];
              if (estimate === undefined) return null;
              const p = point(index, ratioFor(estimate));
              return <circle key={axis.key} cx={p.x} cy={p.y} r="6" className="stats-radar-estimate provisional-chart-marker" />;
            }
            const p = point(index, ratioFor(axis.score)), active = axis.key === selected;
            return <circle key={axis.key} cx={p.x} cy={p.y} r={active ? 6.5 : 4} className={`stats-radar-vertex${active ? ' selected' : ''}`} />;
          })}
        </svg>
        {axes.map((axis, index) => {
          // `radius + 18` on the spoke, then cleared of the vertex by half the label's bulk.
          const angle = radarAngle(index, count), label = radius + 18;
          const x = cx + (label + 22) * Math.cos(angle), y = cy + (label + 10) * Math.sin(angle);
          const estimate = axis.score === null ? estimated[axis.key] : undefined;
          return <button key={axis.key} type="button" className={`stats-radar-label${axis.score === null ? ' empty' : ''}`} style={{ left: x, top: y }}
            aria-pressed={axis.key === selected} aria-label={`${axis.label}, ${axis.score === null ? 'no data' : `${Math.round(axis.score)} versus D1`}`}
            onClick={() => setSelected(axis.key)}>
            <span>{axis.label}</span><strong>{estimate !== undefined ? `${Math.round(estimate)} est.` : scoreText(axis.score)}</strong>
          </button>;
        })}
      </div>
    </div>
    {estimates.filter(entry => estimated[entry.axis] !== undefined).map(entry => <ProvisionalEstimateNote key={entry.id} estimate={entry} score={estimated[entry.axis]} />)}
  </section>;
}
