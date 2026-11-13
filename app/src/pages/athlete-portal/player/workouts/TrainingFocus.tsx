import { useEffect, useState } from 'react';
import { CATEGORY_STYLE, PERIODS, PERIOD_CAPTION, PERIOD_TITLE, TIME_BASES, TIME_BASIS_EXPLANATION, TIME_BASIS_TITLE,
  breakdownEmptyText, breakdownHeadline, durationShort, durationSpoken, focusArcs, focusSlices, percent } from './hub';
import type { FocusArc, FocusCategory, FocusSummary, Period, TimeBasis } from './hub';
import './workouts.css';

const PERIOD_KEY = 'training.breakdownPeriod', BASIS_KEY = 'training.focus.timeBasis';
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* a per-device preference only */ } };

/** The breakdown's period and time basis, remembered on this device as the app does. */
export function useFocusPreferences() {
  const [period, setPeriod] = useState<Period>(() => { const v = read(PERIOD_KEY); return PERIODS.includes(v as Period) ? v as Period : 'week'; });
  const [basis, setBasis] = useState<TimeBasis>(() => read(BASIS_KEY) === 'active' ? 'active' : 'total');
  return { period, basis, setPeriod: (p: Period) => { setPeriod(p); write(PERIOD_KEY, p); }, setBasis: (b: TimeBasis) => { setBasis(b); write(BASIS_KEY, b); } };
}

/** The all-time stats row: time, workouts and favorite focus (`TrainingStatsRow`, V4 tiles). Not shown on the web now: it left the hub with the app's redesign, and Nolan took it off Stats (2026-11-12). */
export function TrainingStatsRow({ summary, hasData }: { summary: FocusSummary; hasData: boolean }) {
  const stats = summary.periods.allTime;
  const favorite = summary.favoriteCategory ? summary.favoriteCategory === 'soccer' ? 'Soccer' : CATEGORY_STYLE[summary.favoriteCategory].name : '—';
  const tiles = [
    { title: TIME_BASIS_TITLE[summary.timeBasis], value: durationShort(stats.secondsTrained, hasData) },
    { title: 'Workouts', value: hasData ? String(stats.workoutsCompleted) : '—' },
    { title: 'Favorite focus', value: hasData ? favorite : '—' },
  ];
  return <div className="wk-stats-row">{tiles.map(tile => <div key={tile.title} className="wk-stat" role="group" aria-label={`${tile.title}: ${tile.value === '—' ? 'no data yet' : tile.value}`}>
    <strong aria-hidden="true">{tile.value}</strong><span aria-hidden="true">{tile.title}</span>
  </div>)}</div>;
}

function slicePath(arc: FocusArc, inner: number, outer: number, c: number, gap: number) {
  const start = arc.start + gap / 2, end = arc.end - gap / 2, sweep = end - start;
  if (sweep <= 0) return '';
  const steps = Math.max(2, Math.ceil(sweep / (2 * Math.PI / 180)));
  const point = (angle: number, r: number) => `${(c + r * Math.sin(angle)).toFixed(2)} ${(c - r * Math.cos(angle)).toFixed(2)}`;
  const angles = Array.from({ length: steps + 1 }, (_, i) => start + sweep * i / steps);
  return `M${angles.map(a => point(a, outer)).join(' L')} L${[...angles].reverse().map(a => point(a, inner)).join(' L')} Z`;
}

function Donut({ arcs, selection, onSelect, total, caption }: { arcs: FocusArc[]; selection: FocusCategory | null; onSelect: (c: FocusCategory | null) => void; total: string; caption: string }) {
  const size = 210, growth = 7, outer = size / 2 - growth, inner = outer - 28, c = size / 2;
  const selected = arcs.find(a => a.category === selection);
  const value = selected ? `${CATEGORY_STYLE[selected.category].name}, ${durationSpoken(selected.seconds)}, ${percent(selected.fraction)} percent` : `${durationSpoken(arcs.reduce((a, s) => a + s.seconds, 0))} ${caption}`;
  return <div className="wk-donut" role="img" aria-label={`Training breakdown: ${value}`}>
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {arcs.map(arc => <path key={arc.category} d={slicePath(arc, inner, outer + (arc.category === selection ? growth : 0), c, arcs.length > 1 ? Math.min(0.9 * Math.PI / 180, (arc.end - arc.start) / 4) : 0)}
        fill={CATEGORY_STYLE[arc.category].color} opacity={selection === null || arc.category === selection ? 1 : 0.45}
        onClick={() => onSelect(arc.category === selection ? null : arc.category)} />)}
    </svg>
    <div className="wk-donut-center" aria-hidden="true">
      {selected ? <strong className="wk-donut-selected">{CATEGORY_STYLE[selected.category].name} · {durationShort(selected.seconds)} · {percent(selected.fraction)}%</strong>
        : <><strong>{total}</strong><small>{caption}</small></>}
    </div>
  </div>;
}

/**
 * Week | Month | Year | All time, the headline, the donut and its legend (`TrainingBreakdownCard`).
 * Not on any page at present: the app keeps Training Focus hidden since the one-page hub, and so does the web.
 */
export function TrainingBreakdownCard({ summary, period, onPeriod, onBasis }: { summary: FocusSummary; period: Period; onPeriod: (p: Period) => void; onBasis: (b: TimeBasis) => void }) {
  const stats = summary.periods[period], slices = focusSlices(stats), arcs = focusArcs(slices);
  const [selection, setSelection] = useState<FocusCategory | null>(null);
  useEffect(() => { setSelection(null); }, [period, summary.timeBasis]);
  useEffect(() => { if (selection && !slices.some(s => s.category === selection)) setSelection(null); }, [slices.map(s => s.category).join(), selection]);
  const detail = selection ? stats.details[selection]?.[0] : undefined;
  const activeEmpty = stats.workoutsCompleted > 0 && summary.timeBasis === 'active';
  return <section className="v4-card wk-breakdown" aria-label="Training focus">
    <div className="wk-breakdown-head"><span className="wk-eyebrow wk-eyebrow-wide">TRAINING FOCUS</span><span className="material-symbols-outlined" aria-hidden="true">pie_chart</span></div>
    <div className="wk-segments wk-segments-4" role="group" aria-label="Period">{PERIODS.map(option => <button type="button" key={option} aria-pressed={option === period} onClick={() => onPeriod(option)}>{PERIOD_TITLE[option]}</button>)}</div>
    <div className="wk-segments" role="group" aria-label="Time">{TIME_BASES.map(basis => <button type="button" key={basis} aria-pressed={summary.timeBasis === basis} onClick={() => onBasis(basis)}>{TIME_BASIS_TITLE[basis]}</button>)}</div>
    <p className="wk-breakdown-headline">{breakdownHeadline(stats, period)}</p>
    {stats.incompleteActiveSessions > 0 && <p className="wk-caption">Active timing is incomplete for {stats.incompleteActiveSessions} workout{stats.incompleteActiveSessions === 1 ? '' : 's'}. Total time includes their saved session time.</p>}
    {!slices.length ? <div className="wk-breakdown-empty">
      <div className="wk-empty-ring"><span className="material-symbols-outlined" aria-hidden="true">pie_chart</span><small>{activeEmpty ? 'No active timing' : breakdownEmptyText(period)}</small></div>
      <p>{activeEmpty ? 'No recorded active time in this period. Choose Total time to include session timing.' : 'Finish a workout, run or ride to see where your training goes.'}</p>
    </div> : <>
      <Donut arcs={arcs} selection={selection} onSelect={setSelection} total={durationShort(stats.secondsTrained)} caption={PERIOD_CAPTION[period]} />
      {selection && detail ? <div className="wk-focus-detail" style={{ ['--focus' as string]: CATEGORY_STYLE[selection].color }}>
        <div className="wk-focus-detail-head"><span className="material-symbols-outlined" aria-hidden="true">{CATEGORY_STYLE[selection].icon}</span><h3>{CATEGORY_STYLE[selection].name}</h3>
          <button type="button" className="wk-icon-button" aria-label="Back to activity time totals" onClick={() => setSelection(null)}><span className="material-symbols-outlined" aria-hidden="true">close</span></button></div>
        <h4>{detail.title}</h4>
        {detail.rows.map(row => { const total = Math.max(1, detail.rows.reduce((a, r) => a + r.seconds, 0)), fraction = row.seconds / total;
          return <div className="wk-focus-row" key={row.title} role="group" aria-label={`${row.title}, ${durationSpoken(row.seconds)}, ${percent(fraction)} percent`}>
            <div aria-hidden="true"><span>{row.title}</span><strong>{percent(fraction)}%</strong><small>{durationShort(row.seconds)}</small></div>
            <i aria-hidden="true"><b style={{ width: `${Math.min(100, fraction * 100)}%` }} /></i>
          </div>; })}
        <p className="wk-caption">{detail.note}</p>
      </div> : <div>
        <div className="wk-legend-head"><span>TIME BY ACTIVITY</span><span>Tap to explore</span></div>
        <div className="wk-legend">{arcs.map(arc => { const style = CATEGORY_STYLE[arc.category];
          return <button type="button" key={arc.category} style={{ ['--focus' as string]: style.color }} aria-label={`${style.name}, ${durationSpoken(arc.seconds)}, ${percent(arc.fraction)} percent`} onClick={() => setSelection(arc.category)}>
            <span className="material-symbols-outlined" aria-hidden="true">{style.icon}</span><span><strong>{style.name}</strong><small>{durationShort(arc.seconds)}</small></span><span className="material-symbols-outlined wk-chevron" aria-hidden="true">chevron_right</span>
          </button>; })}</div>
      </div>}
      <p className="wk-caption wk-caption-faint">{TIME_BASIS_EXPLANATION[summary.timeBasis]}</p>
    </>}
  </section>;
}
