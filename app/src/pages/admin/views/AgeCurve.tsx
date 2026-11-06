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
}

export default function AgeCurve({ drillKey, data, playerId, value, age }: {
  drillKey: string;
  data: AgeCurveData;
  playerId: string;
  value: number | null;
  age: { age: number; exact: boolean } | null;
}) {
  const display = DISPLAY[drillKey];
  const higher = BENCHMARK_METRIC[drillKey]?.higherIsBetter ?? true;
  const [hover, setHover] = useState<AgePoint | null>(null);
  const width = 400, height = 250, left = 42, right = 10, top = 14, bottom = 30;
  const others = useMemo(() => data.points.filter(point => point.repKey !== data.currentRepKey), [data.points, data.currentRepKey]);

  const domain = useMemo(() => {
    const ages = [...others.map(p => p.age), ...(age ? [age.age] : [])];
    const values = [...others.map(p => p.value), ...(value !== null ? [value] : [])];
    let x0 = ages.length ? Math.floor(Math.min(...ages)) : 10, x1 = ages.length ? Math.ceil(Math.max(...ages)) : 18;
    if (x1 - x0 < 4) { x0 -= 2; x1 += 2; }
    let y0 = values.length ? Math.min(...values) : 0, y1 = values.length ? Math.max(...values) : 1;
    const pad = (y1 - y0) * 0.08 || y1 * 0.1 || 1;
    y0 -= pad; y1 += pad;
    return { x0, x1, y0: Math.max(0, y0), y1 };
  }, [others, age, value]);

  if (!display) return null;
  const x = (years: number) => left + ((years - domain.x0) / (domain.x1 - domain.x0)) * (width - left - right);
  const y = (v: number) => top + (1 - (Math.min(domain.y1, Math.max(domain.y0, v)) - domain.y0) / (domain.y1 - domain.y0)) * (height - top - bottom);
  const shown = (v: number) => `${(v * display.scale).toFixed(display.digits)} ${display.unit}`;
  const xTicks = Array.from({ length: domain.x1 - domain.x0 + 1 }, (_, i) => domain.x0 + i).filter((_, i, all) => all.length <= 10 || i % 2 === 0);
  const yTicks = [domain.y0, (domain.y0 + domain.y1) / 2, domain.y1];
  const path = (pick: (point: CurvePoint) => number) => data.curve.map((point, i) => `${i ? "L" : "M"}${x(point.age).toFixed(1)},${y(pick(point)).toFixed(1)}`).join("");
  const band = age ? bandForAge(data.bands, age.age) : null;
  const overall = value !== null ? percentileAmong(others, value, higher, data.currentRepKey) : null;
  const matched = value !== null && age ? percentileAmong(others, value, higher, data.currentRepKey, point => Math.abs(point.age - age.age) <= 1) : null;
  const orgMedian = age ? curveAt(data.curve, age.age) : null;
  const pct = (a: number, b: number) => `${(a / b - 1) * 100 >= 0 ? "+" : ""}${((a / b - 1) * 100).toFixed(1)}%`;
  const scope = data.scopeLabel ?? "the organization";

  return (
    <section className="admin-card rv-age">
      <h3>Age vs. performance · {scope}</h3>
      <p className="admin-note">
        {higher ? "Higher is better." : "Lower is better."} Blue: every {scope} rep ({others.length} from {data.athletes} athletes). Orange rings: this athlete's other reps; filled: this rep.
        Line and shading: {scope} median and middle half by age; dashed grey: published benchmark median{data.benchmarkLabel ? ` (${data.benchmarkLabel})` : ""}.
      </p>
      {data.loading && <p className="admin-note"><span className="spinner small" /> Loading every {scope} rep for this drill…</p>}
      {data.error && <p className="form-message" role="alert">{data.error}</p>}
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Age versus result across ${scope}`}>
        {yTicks.map(t => (
          <g key={t}>
            <line className="re-grid" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
            <text className="re-axis" x={left - 5} y={y(t) + 3} textAnchor="end">{(t * display.scale).toFixed(display.digits)}</text>
          </g>
        ))}
        {xTicks.map(t => <text key={t} className="re-axis" x={x(t)} y={height - bottom + 14} textAnchor="middle">{t}</text>)}
        <text className="re-axis" x={(left + width - right) / 2} y={height - 4} textAnchor="middle">age (years) · {display.unit}</text>
        {data.bands.filter(b => b.to > domain.x0 && b.from < domain.x1).map(b => (
          <line key={b.key} className="rv-age-benchmark" x1={x(Math.max(b.from, domain.x0))} x2={x(Math.min(b.to, domain.x1)) - 2} y1={y(b.p50)} y2={y(b.p50)} />
        ))}
        {data.curve.length > 1 && <path className="rv-age-band-path" d={`${path(p => p.p75)}${data.curve.slice().reverse().map(point => `L${x(point.age).toFixed(1)},${y(point.p25).toFixed(1)}`).join("")}Z`} />}
        {others.map(point => (
          <circle key={point.repKey} cx={x(point.age)} cy={y(point.value)} r={point.playerId === playerId ? 4.5 : 3}
            fill={point.playerId === playerId ? "none" : OTHERS} fillOpacity={0.5} stroke={point.playerId === playerId ? THIS_REP : "none"} strokeWidth={1.8}
            onMouseEnter={() => setHover(point)} onMouseLeave={() => setHover(null)}>
            <title>{`${point.name}: ${shown(point.value)} at ${point.age.toFixed(1)} y`}</title>
          </circle>
        ))}
        {data.curve.length > 1 && <path className="rv-age-median-path" d={path(p => p.median)} />}
        {value !== null && age && <circle cx={x(age.age)} cy={y(value)} r={6} fill={THIS_REP} stroke="var(--surface-1, #fff)" strokeWidth={2} />}
      </svg>
      <p className="re-readout">
        {hover ? `${hover.name}: ${shown(hover.value)} at ${hover.age.toFixed(1)} y${hover.exactAge ? "" : " (whole-year age)"}`
          : value !== null ? `This rep: ${primaryResultText(drillKey, value)}${age ? ` at ${age.age.toFixed(1)} y${age.exact ? "" : " (whole-year age)"}` : ""}` : "This rep has no result."}
      </p>
      {value !== null && (
        <ul className="rv-age-facts">
          {matched && <li>Age-matched (±1 year, {matched.n} reps): better than {matched.percent.toFixed(0)}% of {scope} reps.</li>}
          {overall && <li>All ages ({overall.n} reps): better than {overall.percent.toFixed(0)}%.</li>}
          {orgMedian !== null && <li>{scope} median at this age: {shown(orgMedian)}; this rep {pct(value, orgMedian)}.</li>}
          {band && <li>{band.label} benchmark median {shown(band.p50)}: this rep {pct(value, band.p50)}{band.derivation !== "measured" || band.athletes < 10 ? ` (benchmark ${band.derivation}, ${band.athletes} athlete${band.athletes === 1 ? "" : "s"}: provisional)` : ""}.</li>}
          {!age && <li>This athlete's profile has no birth date or age, so the rep is not placed on the age axis.</li>}
          {(data.missingAge > 0 || data.excluded > 0) && <li>Not plotted: {data.missingAge} reps from athletes without an age, {data.excluded} rejected, invalid or result-less reps.</li>}
        </ul>
      )}
    </section>
  );
}
