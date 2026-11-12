import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { bandPath, cloudAt, cloudExtent, cloudFrom, cloudLayers, groupAverage, linePath, standingOf, stepDigits, valueAxis } from './club-cloud';
import type { ClubStats } from './club-cloud';

const CLOUD = '#d6f8e4';
const LINE = '#f1fff6';
const ACCENT = '#7cff18';
/** The card's colour, for the ring that keeps a point legible over the cloud. */
const SURFACE = '#10291f';
const LAYERS = cloudLayers();
/** Units of time, where a smaller value is quicker. */
const TIME_UNITS = new Set(['s']);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The club comparison under the pose player (Nolan, 2026-11-11): the club's average for one test
 * as a smooth line across age groups, its spread as a soft cloud (densest on the line, fading
 * through one and two standard deviations), and this athlete's result(s) on top in the accent.
 * Statistics only (`ClubStats`); the maths is in club-cloud.ts.
 */
export default function ClubCloudChart({ stats, title, context, digits }: { stats: ClubStats; title: string; context: string[]; digits: number }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => { if (element.clientWidth > 0) setWidth(element.clientWidth); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const id = `club-cloud-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [focus, setFocus] = useState<number | null>(null);
  const cloud = useMemo(() => cloudFrom(stats.groups), [stats.groups]);
  const own = stats.own;
  const ownAge = own && finite(own.ageGroup) ? own.ageGroup : null;
  const standing = standingOf(stats, cloud);
  const shown = (value: number, unit = true) => `${value.toFixed(digits)}${unit ? ` ${stats.unit}` : ''}`;

  // Geometry: the plot is drawn at the frame's own width, so text keeps its size on every screen.
  const compact = width < 520;
  const height = compact ? 232 : 292;
  const margin = { left: 46, right: compact ? 12 : 18, top: 14, bottom: 30 };
  const plotWidth = Math.max(80, width - margin.left - margin.right), plotHeight = height - margin.top - margin.bottom;
  const ages = [cloud?.from, cloud?.to, ownAge].filter(finite);
  let low = ages.length ? Math.min(...ages) - 0.5 : 8, high = ages.length ? Math.max(...ages) + 0.5 : 18;
  if (high - low < 4) { const middle = (low + high) / 2; low = middle - 2; high = middle + 2; }
  const values = own ? [own.best, ...own.results].filter(finite) : [];
  const [cloudLow, cloudHigh] = cloud ? cloudExtent(cloud, 2) : [Infinity, -Infinity];
  const axis = valueAxis(Math.min(cloudLow, ...values), Math.max(cloudHigh, ...values), compact ? 4 : 5);
  const x = (age: number) => margin.left + ((age - low) / (high - low)) * plotWidth;
  const y = (value: number) => margin.top + (1 - (value - axis.from) / (axis.to - axis.from)) * plotHeight;
  const tickDigits = stepDigits(axis.step);

  // Age groups along the bottom; every other one when they would crowd, always the athlete's.
  const groupTicks = Array.from({ length: Math.floor(high) - Math.ceil(low) + 1 }, (_, i) => Math.ceil(low) + i);
  const crowded = plotWidth / (high - low) < 30;
  const labelled = groupTicks.filter(age => !crowded || (age - (ownAge ?? groupTicks[0])) % 2 === 0);
  const hoverable = groupTicks.filter(age => cloudAt(cloud, age) || age === ownAge);

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const age = low + (((event.clientX - box.left) * (width / box.width) - margin.left) / plotWidth) * (high - low);
    const nearest = hoverable.reduce<number | null>((best, candidate) => best === null || Math.abs(candidate - age) < Math.abs(best - age) ? candidate : best, null);
    setFocus(nearest !== null && Math.abs(nearest - age) <= 0.75 ? nearest : null);
  };
  const step = (event: KeyboardEvent<SVGSVGElement>) => {
    const move = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!move || !hoverable.length) return;
    event.preventDefault();
    const index = focus === null ? -1 : hoverable.indexOf(focus);
    setFocus(hoverable[Math.min(hoverable.length - 1, Math.max(0, index < 0 ? 0 : index + move))]);
  };

  // The line under the plot: the best against the average of the athlete's age group.
  const time = TIME_UNITS.has(stats.unit);
  const versus = standing ? (standing.ageGroup !== null ? `the U${standing.ageGroup} average` : 'the club average') : '';
  const gap = standing ? Math.abs(standing.difference) : 0;
  const level = standing !== null && Number(gap.toFixed(digits)) === 0;
  const chip = !standing ? null : level ? 'level' : `${shown(gap)} ${time ? (standing.difference < 0 ? 'faster' : 'slower') : (standing.difference > 0 ? 'above' : 'below')}`;
  const tail = !standing ? '' : level ? `with ${versus}` : time ? `than ${versus}` : versus;
  // A difference under a tenth of the spread is shown, but not coloured as better or worse.
  const tone = !standing || level || gap < 0.1 * standing.sd ? 'level' : standing.better ? 'better' : 'worse';
  const days = own && own.results.length > 1 ? `best of ${own.results.length} testing days` : null;
  const label = [title, 'Club average and spread by age group', own ? `You: ${shown(own.best)}${chip ? `, ${chip} ${tail}` : ''}` : null].filter(Boolean).join('. ');

  // The value beside the athlete's point: above it when the point is on or above the line, else below.
  const dotX = ownAge !== null ? x(ownAge) : 0, dotY = own ? y(own.best) : 0;
  const lineAtOwn = ownAge !== null ? cloudAt(cloud, ownAge) : null;
  let above = !lineAtOwn || dotY <= y(lineAtOwn.mean) + 1;
  if (above && dotY < margin.top + 34) above = false;
  else if (!above && dotY > margin.top + plotHeight - 34) above = true;
  const pillX = dotX < margin.left + 40 ? '-12px' : dotX > width - margin.right - 40 ? 'calc(-100% + 12px)' : '-50%';
  const pill = { left: dotX, top: dotY, transform: `translate(${pillX}, ${above ? 'calc(-100% - 13px)' : '13px'})` };

  // The readout states each age group's own statistics (the line is their smoothed trend); an
  // omitted group between two others reads the curve, marked as an estimate.
  const focused = focus !== null ? groupAverage(stats, cloud, focus) : null;
  // The readout sits on the open side of the hairline.
  const tipRight = focus !== null && x(focus) < width / 2;

  return <section className="stats-club club-cloud" aria-label="Club comparison">
    <h3>{title}</h3>
    <p className="club-cloud-context">{['Average and spread by age', ...context].join(' · ')}</p>
    {cloud || ownAge !== null ? <div ref={frame} className="club-cloud-frame">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} tabIndex={0}
        onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setFocus(null)} onKeyDown={step}
        onFocus={() => setFocus(ownAge !== null && hoverable.includes(ownAge) ? ownAge : hoverable[0] ?? null)} onBlur={() => setFocus(null)}>
        <defs>
          <clipPath id={`${id}-plot`}><rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} /></clipPath>
          <radialGradient id={`${id}-glow`}><stop offset="0" stopColor={ACCENT} stopOpacity={0.42} /><stop offset="1" stopColor={ACCENT} stopOpacity={0} /></radialGradient>
          {/* Softens the cloud's two ends by a couple of pixels, sideways only (a gradient or mask
              there shows colour fringes in WebKit once 32 faint bands are stacked). */}
          <filter id={`${id}-soft`} x="-0.05" width="1.1" y="0" height="1"><feGaussianBlur stdDeviation="2 0" /></filter>
        </defs>
        {axis.ticks.map(tick => <g key={tick} className="club-cloud-grid">
          <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
          <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end">{tick.toFixed(tickDigits)} {stats.unit}</text>
        </g>)}
        {labelled.map(age => <text key={age} className={`club-cloud-age${age === ownAge ? ' is-own' : ''}`} x={x(age)} y={height - 9} textAnchor="middle">U{age}</text>)}
        {cloud && <g className="club-cloud-shape" clipPath={`url(#${id}-plot)`}>
          <g filter={`url(#${id}-soft)`}>{LAYERS.map(layer => <path key={layer.k} d={bandPath(cloud, layer.k, x, y)} fill={CLOUD} fillOpacity={layer.opacity} />)}</g>
          <path className="club-cloud-line" d={linePath(cloud, x, y)} fill="none" stroke={LINE} strokeWidth={2} strokeLinecap="round" />
        </g>}
        {focus !== null && <line className="club-cloud-focus" aria-hidden="true" x1={x(focus)} x2={x(focus)} y1={margin.top} y2={margin.top + plotHeight} />}
        {own && ownAge !== null && <g className="club-cloud-own">
          {own.results.filter(value => value !== own.best).map((value, index) => <circle key={index} cx={x(ownAge)} cy={y(value)} r={4.5}
            fill={SURFACE} stroke={ACCENT} strokeWidth={2}><title>{shown(value)}</title></circle>)}
          <circle className="club-cloud-glow" cx={x(ownAge)} cy={y(own.best)} r={20} fill={`url(#${id}-glow)`} />
          <circle className="club-cloud-you" cx={x(ownAge)} cy={y(own.best)} r={6.5} fill={ACCENT} stroke={SURFACE} strokeWidth={2.5}><title>{`You: ${shown(own.best)}`}</title></circle>
        </g>}
      </svg>
      {own && ownAge !== null && <span className="club-cloud-pill" aria-hidden="true" style={pill}>You · {shown(own.best)}</span>}
      {focus !== null && <div className="club-cloud-tip" aria-hidden="true" style={tipRight ? { left: x(focus) + 10 } : { right: width - x(focus) + 10 }}>
        <span className="club-cloud-tip-head">U{focus} · {focused?.count ? `${focused.count} players` : 'under 5 players'}</span>
        {focused && <span><strong>{focused.count ? '' : '≈'}{shown(focused.mean)}</strong> average</span>}
        {focused && focused.sd > 0 && <span><strong>{shown(Math.max(0, focused.mean - focused.sd), false)}–{shown(focused.mean + focused.sd)}</strong> typical</span>}
        {own && focus === ownAge && <span className="club-cloud-tip-you"><i aria-hidden="true" /><strong>{shown(own.best)}</strong> you</span>}
      </div>}
    </div> : <p className="club-cloud-empty">Not enough players in any age group to draw the club curve yet.</p>}
    {own ? <p className="club-cloud-summary">
      <strong>{shown(own.best)}</strong>
      {chip ? <> <span className="club-cloud-diff" data-standing={tone}>{chip}</span> {tail}</> : ' · the only result so far'}
      {days && <span className="club-cloud-days"> · {days}</span>}
    </p> : <p className="club-cloud-summary is-none">No result for you on this test yet.</p>}
    <div className="stats-sr-only">
      <table>
        <caption>{title}: average and standard deviation by age group</caption>
        <thead><tr><th scope="col">Age group</th><th scope="col">Players</th><th scope="col">Average</th><th scope="col">Standard deviation</th></tr></thead>
        <tbody>{stats.groups.map(group => <tr key={group.ageGroup}><th scope="row">U{group.ageGroup}</th><td>{group.count}</td><td>{shown(group.mean)}</td><td>{shown(group.sd)}</td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}
