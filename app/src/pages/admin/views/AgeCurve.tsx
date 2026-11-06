// Where this rep sits on the age × performance curve: every athlete measured in
// the session (their best), the rep under review, and the published benchmark
// median and middle half per age band. One axis, one unit; hover any point.

import { useMemo, useState } from "react";
import type { AgePoint, BenchmarkBand } from "../lib/ageCurve";
import { BENCHMARK_METRIC, bandForAge, cohortRank } from "../lib/ageCurve";
import { primaryResultText } from "../lib/resultValidation";

// Reference slots: blue for the session, orange for this rep (validated on light).
const SESSION = "#2a78d6";
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
  points: AgePoint[];
  bands: BenchmarkBand[];
  missingAge: number;
  gender: string;
  benchmarkLabel: string | null;
}

export default function AgeCurve({ drillKey, data, playerId, value, age }: {
  drillKey: string;
  data: AgeCurveData;
  playerId: string;
  /** This rep's value (stored units): the adjusted value while adjusting. */
  value: number | null;
  /** The athlete's age on the test date, or null when the profile has none. */
  age: { age: number; exact: boolean } | null;
}) {
  const display = DISPLAY[drillKey];
  const higher = BENCHMARK_METRIC[drillKey]?.higherIsBetter ?? true;
  const [hover, setHover] = useState<string | null>(null);
  const width = 400, height = 230, left = 42, right = 10, top = 12, bottom = 30;

  const domain = useMemo(() => {
    const ages = [...data.points.map(p => p.age), ...(age ? [age.age] : [])];
    const values = [...data.points.map(p => p.value), ...(value !== null ? [value] : [])];
    let x0 = ages.length ? Math.floor(Math.min(...ages) - 1) : 10, x1 = ages.length ? Math.ceil(Math.max(...ages) + 1) : 18;
    for (const band of data.bands) if (band.to > x0 && band.from < x1) values.push(band.p25 ?? band.p50, band.p50, band.p75 ?? band.p50);
    if (x1 - x0 < 4) { x0 -= 1; x1 += 1; }
    let y0 = values.length ? Math.min(...values) : 0, y1 = values.length ? Math.max(...values) : 1;
    const pad = (y1 - y0) * 0.12 || y1 * 0.1 || 1;
    y0 -= pad; y1 += pad;
    return { x0, x1, y0: Math.max(0, y0), y1 };
  }, [data, age, value]);

  if (!display) return null;
  const x = (years: number) => left + ((years - domain.x0) / (domain.x1 - domain.x0)) * (width - left - right);
  const y = (v: number) => top + (1 - (v - domain.y0) / (domain.y1 - domain.y0)) * (height - top - bottom);
  const shown = (v: number) => `${(v * display.scale).toFixed(display.digits)} ${display.unit}`;
  const xTicks = Array.from({ length: domain.x1 - domain.x0 + 1 }, (_, i) => domain.x0 + i).filter((_, i, all) => all.length <= 9 || i % 2 === 0);
  const yTicks = [domain.y0, (domain.y0 + domain.y1) / 2, domain.y1];
  const band = age ? bandForAge(data.bands, age.age) : null;
  const rank = value !== null ? cohortRank(data.points, playerId, value, higher) : null;
  const hovered = data.points.find(point => point.repKey === hover) ?? null;
  const own = data.points.find(point => point.playerId === playerId) ?? null;

  return (
    <section className="admin-card rv-age">
      <h3>Age vs. performance</h3>
      <p className="admin-note">{higher ? "Higher is better." : "Lower is better."} Blue: each athlete's best in this session. Orange: this rep{own ? " (ring: this athlete's session best)" : ""}. Shaded: benchmark middle half, line: median{data.benchmarkLabel ? ` (${data.benchmarkLabel})` : ""}.</p>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Age versus result">
        {yTicks.map(t => (
          <g key={t}>
            <line className="re-grid" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
            <text className="re-axis" x={left - 5} y={y(t) + 3} textAnchor="end">{(t * display.scale).toFixed(display.digits)}</text>
          </g>
        ))}
        {xTicks.map(t => <text key={t} className="re-axis" x={x(t)} y={height - bottom + 14} textAnchor="middle">{t}</text>)}
        <text className="re-axis" x={(left + width - right) / 2} y={height - 4} textAnchor="middle">age (years) · {display.unit}</text>
        {data.bands.filter(b => b.to > domain.x0 && b.from < domain.x1).map(b => {
          const x1 = x(Math.max(b.from, domain.x0)), x2 = x(Math.min(b.to, domain.x1));
          const lo = b.p25 ?? b.p50, hi = b.p75 ?? b.p50;
          return (
            <g key={b.key}>
              {hi > lo && <rect className="rv-age-band" x={x1} width={Math.max(0, x2 - x1 - 2)} y={y(hi)} height={Math.max(1, y(lo) - y(hi))} />}
              <line className="rv-age-median" x1={x1} x2={x2 - 2} y1={y(b.p50)} y2={y(b.p50)} />
              <text className="re-axis" x={(x1 + x2) / 2} y={top + 8} textAnchor="middle">{b.label}{b.athletes < 10 ? ` · n=${b.athletes}` : ""}</text>
            </g>
          );
        })}
        {data.points.map(point => (
          <circle key={point.repKey} cx={x(point.age)} cy={y(point.value)} r={point.playerId === playerId ? 7 : 5}
            fill={point.playerId === playerId ? "none" : SESSION} stroke={point.playerId === playerId ? THIS_REP : "var(--surface-1, #fff)"} strokeWidth={2}
            opacity={point.exactAge ? 1 : 0.6} onMouseEnter={() => setHover(point.repKey)} onMouseLeave={() => setHover(null)}>
            <title>{`${point.name}: ${shown(point.value)} at ${point.age.toFixed(1)} y${point.exactAge ? "" : " (whole-year age)"}`}</title>
          </circle>
        ))}
        {value !== null && age && <circle cx={x(age.age)} cy={y(value)} r={5.5} fill={THIS_REP} stroke="var(--surface-1, #fff)" strokeWidth={2} />}
      </svg>
      <p className="re-readout">
        {hovered ? `${hovered.name}: ${shown(hovered.value)} at ${hovered.age.toFixed(1)} y` : value !== null
          ? `This rep: ${primaryResultText(drillKey, value)}${age ? ` at ${age.age.toFixed(1)} y${age.exact ? "" : " (whole-year age)"}` : ""}`
          : "This rep has no result."}
      </p>
      {!hovered && value !== null && (
        <ul className="rv-age-facts">
          {rank && <li>Rank {rank.rank} of {rank.of} in this session ({data.points.length} athletes with an age{data.missingAge ? `; ${data.missingAge} without an age not plotted` : ""}).</li>}
          {band && <li>{band.label} benchmark median {shown(band.p50)}: this rep is {((value / band.p50 - 1) * 100 >= 0 ? "+" : "")}{((value / band.p50 - 1) * 100).toFixed(1)}%{band.derivation !== "measured" || band.athletes < 10 ? ` (benchmark ${band.derivation}, ${band.athletes} athlete${band.athletes === 1 ? "" : "s"}; treat as provisional)` : ""}.</li>}
          {!data.bands.length && <li>No published benchmark is available for this drill.</li>}
          {!age && <li>This athlete's profile has no birth date or age, so the rep is not placed on the age axis.</li>}
        </ul>
      )}
    </section>
  );
}
