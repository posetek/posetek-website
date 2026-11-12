// Where this rep sits among every rep in the organization: each rep at the
// athlete's age on its date, the organization's own median curve and middle
// half by age, this athlete's other reps, and the rep under review. The
// published benchmark median per age band is drawn faintly for reference.
// One axis, one unit; hover a dot for the athlete and value.

import { useMemo, useState } from "react";
import type { AgePoint, BenchmarkBand, CurvePoint } from "../lib/ageCurve";
import { BENCHMARK_METRIC, bandForAge, curveAt, percentileAmong } from "../lib/ageCurve";
import { primaryResultText } from "../lib/resultValidation";

// Reference categorical slots 1 and 2 (validated on the light surface).
const OTHERS = "#2a78d6";
const THIS_REP = "#eb6834";

const DISPLAY: Record<string, { unit: string; scale: number; digits: number }> = {
  broadJump: { unit: "ft", scale: 3.28084, digits: 1 },
  jump: { unit: "in", scale: 39.37007874, digits: 1 },
  sprint: { unit: "mph", scale: 2.23694, digits: 1 },
  shooting: { unit: "mph", scale: 2.23694, digits: 1 },
  changeOfDirection: { unit: "s", scale: 1, digits: 2 },
  dribbling: { unit: "s", scale: 1, digits: 2 },
};

export interface AgeCurveData {
  /** e.g. "Vacaville SC"; null while the organization is unknown. */
  scopeLabel: string | null;
  points: AgePoint[];
  curve: CurvePoint[];
  bands: BenchmarkBand[];
  missingAge: number;
  excluded: number;
  athletes: number;
  loading: boolean;
  error: string | null;
  gender: string;
  benchmarkLabel: string | null;
  /** `${playerId}/${repId}` of the rep under review (drawn separately, with its current value). */
  currentRepKey: string;
  athleteName: string;
  /** Where to place an athlete whose profile has no age: the median age of the session's athletes. */
  estimatedAge: { age: number; basis: string } | null;
  /** This athlete's other results for the drill in this session (shown as ticks even without an age). */
  athleteValues: number[];
}

/**
 * The same plot on a page other than result validation (the athlete's Stats page): its own words,
 * units, colours and age axis. Other points are never named. Without a view the plot is unchanged.
 */
export interface AgeCurveView {
  title: string;
  note: string | null;
  /** Used instead of the drill's admin display (the Stats page shows a sprint as its time). */
  display: { unit: string; scale: number; digits: number };
  higherIsBetter: boolean;
  colors: { others: string; highlight: string };
  /** The label on this athlete's point. */
  callout: string;
  /** Names each whole-number tick of the age axis (e.g. 11 → "U11"), and the axis. */
  xTick: (age: number) => string;
  xLabel: string;
  /** A stable sideways offset per point, so athletes at one age stay apart. */
  xOffset?: (point: AgePoint) => number;
  /** The line under the plot, in place of the admin readout and facts. */
  readout: string;
  className: string;
}

export default function AgeCurve({ drillKey, data, playerId, value, age, view }: {
  drillKey: string;
  data: AgeCurveData;
  playerId: string;
  value: number | null;
  age: { age: number; exact: boolean } | null;
  view?: AgeCurveView;
}) {
  const display = view?.display ?? DISPLAY[drillKey];
  const higher = view?.higherIsBetter ?? BENCHMARK_METRIC[drillKey]?.higherIsBetter ?? true;
  const othersColor = view?.colors.others ?? OTHERS, highlight = view?.colors.highlight ?? THIS_REP;
  const calloutWidth = view ? Math.max(40, view.callout.length * 7.5 + 12) : 116;
  const [hover, setHover] = useState<AgePoint | null>(null);
  // Without a profile age the rep is placed at an estimate, or wherever the reviewer types (not saved).
  const [ageInput, setAgeInput] = useState("");
  const typedAge = Number(ageInput);
  const placement: { age: number; kind: "exact" | "whole-year" | "estimated" | "typed" } | null = age
    ? { age: age.age, kind: age.exact ? "exact" : "whole-year" }
    : ageInput.trim() !== "" && Number.isFinite(typedAge) && typedAge >= 5 && typedAge <= 40 ? { age: typedAge, kind: "typed" }
      : data.estimatedAge ? { age: data.estimatedAge.age, kind: "estimated" } : null;
  const placementAge = placement?.age ?? null;
  const width = 400, height = 250, left = 42, right = 10, top = 14, bottom = 30;
  const others = useMemo(() => data.points.filter(point => point.repKey !== data.currentRepKey), [data.points, data.currentRepKey]);

  const domain = (() => {
    const ages = [...others.map(p => p.age), ...(placementAge !== null ? [placementAge] : [])];
    const values = [...others.map(p => p.value), ...(value !== null ? [value] : []), ...data.athleteValues];
    let x0 = ages.length ? Math.floor(Math.min(...ages)) : 10, x1 = ages.length ? Math.ceil(Math.max(...ages)) : 18;
    if (x1 - x0 < 4) { x0 -= 2; x1 += 2; }
    // Room for the sideways offset at both ends.
    if (view?.xOffset) { x0 -= 0.5; x1 += 0.5; }
    let y0 = values.length ? Math.min(...values) : 0, y1 = values.length ? Math.max(...values) : 1;
    const pad = (y1 - y0) * 0.08 || y1 * 0.1 || 1;
    y0 -= pad; y1 += pad;
    return { x0, x1, y0: Math.max(0, y0), y1 };
  })();

  if (!display) return null;
  const x = (years: number) => left + ((years - domain.x0) / (domain.x1 - domain.x0)) * (width - left - right);
  const y = (v: number) => top + (1 - (Math.min(domain.y1, Math.max(domain.y0, v)) - domain.y0) / (domain.y1 - domain.y0)) * (height - top - bottom);
  const shown = (v: number) => `${(v * display.scale).toFixed(display.digits)} ${display.unit}`;
  // Whole years only (the admin domain is whole years already; a view's may be padded by half a year).
  const xTicks = Array.from({ length: Math.floor(domain.x1) - Math.ceil(domain.x0) + 1 }, (_, i) => Math.ceil(domain.x0) + i).filter((_, i, all) => all.length <= 10 || i % 2 === 0);
  const pointText = (point: AgePoint) => view ? `${shown(point.value)} · ${view.xTick(point.age)}` : `${point.name}: ${shown(point.value)} at ${point.age.toFixed(1)} y`;
  const yTicks = [domain.y0, (domain.y0 + domain.y1) / 2, domain.y1];
  const path = (pick: (point: CurvePoint) => number) => data.curve.map((point, i) => `${i ? "L" : "M"}${x(point.age).toFixed(1)},${y(pick(point)).toFixed(1)}`).join("");
  const band = placement ? bandForAge(data.bands, placement.age) : null;
  const overall = value !== null ? percentileAmong(others, value, higher, data.currentRepKey) : null;
  const matched = value !== null && placement ? percentileAmong(others, value, higher, data.currentRepKey, point => Math.abs(point.age - placement.age) <= 1) : null;
  const orgMedian = placement ? curveAt(data.curve, placement.age) : null;
  const ageNote = placement?.kind === "estimated" ? " (estimated age)" : placement?.kind === "typed" ? " (age you entered)" : "";
  const pct = (a: number, b: number) => `${(a / b - 1) * 100 >= 0 ? "+" : ""}${((a / b - 1) * 100).toFixed(1)}%`;
  const scope = data.scopeLabel ?? "the organization";

  return (
    <section className={view ? view.className : "admin-card rv-age"}>
      <h3>{view ? view.title : <>Age vs. performance · {scope}</>}</h3>
      {view ? view.note && <p className="admin-note">{view.note}</p> : <p className="admin-note">
        {higher ? "Higher is better." : "Lower is better."} Blue: every {scope} rep ({others.length} from {data.athletes} athletes). Orange rings: this athlete's other reps; filled: this rep.
        Line and shading: {scope} median and middle half by age; dashed grey: published benchmark median{data.benchmarkLabel ? ` (${data.benchmarkLabel})` : ""}.
      </p>}
      {data.loading && <p className="admin-note"><span className="spinner small" /> Loading every {scope} rep for this drill…</p>}
      {data.error && <p className="form-message" role="alert">{data.error}</p>}
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Age versus result across ${scope}`}>
        {yTicks.map(t => (
          <g key={t}>
            <line className="re-grid" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
            <text className="re-axis" x={left - 5} y={y(t) + 3} textAnchor="end">{(t * display.scale).toFixed(display.digits)}</text>
          </g>
        ))}
        {xTicks.map(t => <text key={t} className="re-axis" x={x(t)} y={height - bottom + 14} textAnchor="middle">{view ? view.xTick(t) : t}</text>)}
        <text className="re-axis" x={(left + width - right) / 2} y={height - 4} textAnchor="middle">{view ? view.xLabel : "age (years)"} · {display.unit}</text>
        {data.bands.filter(b => b.to > domain.x0 && b.from < domain.x1).map(b => (
          <line key={b.key} className="rv-age-benchmark" x1={x(Math.max(b.from, domain.x0))} x2={x(Math.min(b.to, domain.x1)) - 2} y1={y(b.p50)} y2={y(b.p50)} />
        ))}
        {data.curve.length > 1 && <path className="rv-age-band-path" d={`${path(p => p.p75)}${data.curve.slice().reverse().map(point => `L${x(point.age).toFixed(1)},${y(point.p25).toFixed(1)}`).join("")}Z`} />}
        {others.map(point => (
          <circle key={point.repKey} cx={x(point.age + (view?.xOffset?.(point) ?? 0))} cy={y(point.value)} r={point.playerId === playerId ? 4.5 : 3}
            fill={point.playerId === playerId ? "none" : othersColor} fillOpacity={0.5} stroke={point.playerId === playerId ? highlight : "none"} strokeWidth={1.8}
            onMouseEnter={() => setHover(point)} onMouseLeave={() => setHover(null)}>
            <title>{pointText(point)}</title>
          </circle>
        ))}
        {data.curve.length > 1 && <path className="rv-age-median-path" d={path(p => p.median)} />}
        {data.athleteValues.map((other, index) => (
          <line key={`tick-${index}`} x1={width - right - 12} x2={width - right} y1={y(other)} y2={y(other)} stroke={THIS_REP} strokeWidth={2.5}>
            <title>{`${data.athleteName}, another rep this session: ${shown(other)}`}</title>
          </line>
        ))}
        {value !== null && (
          <g className="rv-age-this">
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke={highlight} strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={left + 4} y={y(value) - 5} className="rv-age-this-label">{view ? shown(value) : <>this rep · {shown(value)}</>}</text>
            {placement && (
              <>
                <line x1={x(placement.age)} x2={x(placement.age)} y1={top} y2={height - bottom} stroke={highlight} strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
                <circle cx={x(placement.age)} cy={y(value)} r={8} fill={placement.kind === "estimated" ? "var(--surface-1, #fff)" : highlight}
                  stroke={placement.kind === "estimated" ? highlight : "var(--surface-1, #fff)"} strokeWidth={placement.kind === "estimated" ? 3 : 2.5} strokeDasharray={placement.kind === "estimated" ? "3 2" : undefined} />
                <g transform={`translate(${Math.min(width - right - calloutWidth - 2, x(placement.age) + 11)}, ${Math.max(top + 2, y(value) - 30)})`}>
                  <rect width={calloutWidth} height={20} rx={4} fill={highlight} />
                  <text x={6} y={14} className="rv-age-callout">{view ? view.callout : <>THIS REP · {data.athleteName.split(" ")[0].slice(0, 10)}</>}</text>
                </g>
              </>
            )}
          </g>
        )}
      </svg>
      {!view && !age && value !== null && (
        <label className="rv-age-input">
          <span>Age unknown{data.estimatedAge && !ageInput ? ` — placed at ${data.estimatedAge.basis} (${data.estimatedAge.age.toFixed(1)} y)` : ""}. Place at age:</span>
          <input type="number" min={5} max={40} step={0.1} value={ageInput} placeholder={data.estimatedAge ? data.estimatedAge.age.toFixed(1) : "e.g. 13.5"} onChange={event => setAgeInput(event.target.value)} />
        </label>
      )}
      <p className="re-readout">
        {view ? (hover ? pointText(hover) : view.readout)
          : hover ? `${hover.name}: ${shown(hover.value)} at ${hover.age.toFixed(1)} y${hover.exactAge ? "" : " (whole-year age)"}`
          : value !== null ? `This rep (${data.athleteName}): ${primaryResultText(drillKey, value)}${placement ? ` at ${placement.age.toFixed(1)} y${placement.kind === "whole-year" ? " (whole-year age)" : ageNote}` : ""}` : "This rep has no result."}
      </p>
      {!view && value !== null && (
        <ul className="rv-age-facts">
          {matched && <li>Age-matched (±1 year{ageNote}, {matched.n} reps): better than {matched.percent.toFixed(0)}% of {scope} reps.</li>}
          {overall && <li>All ages ({overall.n} reps): better than {overall.percent.toFixed(0)}%.</li>}
          {orgMedian !== null && <li>{scope} median at this age{ageNote}: {shown(orgMedian)}; this rep {pct(value, orgMedian)}.</li>}
          {data.athleteValues.length > 0 && <li>{data.athleteName}'s other reps this session (ticks at the right edge): {data.athleteValues.map(shown).join(", ")}.</li>}
          {band && <li>{band.label} benchmark median {shown(band.p50)}: this rep {pct(value, band.p50)}{band.derivation !== "measured" || band.athletes < 10 ? ` (benchmark ${band.derivation}, ${band.athletes} athlete${band.athletes === 1 ? "" : "s"}: provisional)` : ""}.</li>}
          {!age && <li>{data.athleteName}'s profile has no birth date or age; add one to the player record to place this athlete exactly.</li>}
          {!others.some(point => point.playerId === playerId) && data.scopeLabel !== "this session" && !data.loading && <li>None of {data.athleteName}'s reps are among the {scope} reps: their player record may not be linked to this organization.</li>}
          {(data.missingAge > 0 || data.excluded > 0) && <li>Not plotted: {data.missingAge} reps from athletes without an age, {data.excluded} rejected, invalid or result-less reps.</li>}
        </ul>
      )}
    </section>
  );
}
