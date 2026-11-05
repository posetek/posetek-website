import { useId, useState } from "react";
import { AboutNumbers, ActivityChart, BreakdownChart } from "../../insights/BreakdownChart";
import type { ExpandedReportSummary } from "../../insights/lib/expanded";
import { EXERCISES, TESTING_LABELS, weeklySeries } from "../../insights/lib/expanded";
import type { ExpandedRequest } from "../../insights/lib/expandedQuery";
import { dateInZone } from "../../insights/lib/expandedQuery";
import { drillLabel } from "../../insights/lib/insights";
import { playerDuration } from "../lib/playerStationTiming";
import { ageScatter, TESTING_DIVISIONS } from "../lib/workspaceTesting";
import type { AdminTesting, TestingAgeSeries } from "../lib/workspaceTesting";
import "./workspace-testing.scss";

function SummaryCard({ label, value, note, previous }: { label: string; value: string | number; note: string; previous?: string }) {
  return <div className="insights-tile"><span>{label}</span><div className="insights-tile-value"><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong></div><em>{note}</em>{previous && <em className="workspace-testing-prior">{previous}</em>}</div>;
}

export function TestingAgeChart({ series }: { series: TestingAgeSeries }) {
  const { points, trends, display, unknownAge } = ageScatter(series), id = useId();
  const minAge = points.length ? Math.min(...points.map(point => point.age)) : 10, maxAge = Math.max(...points.map(point => point.age), minAge + 1);
  const top = Math.max(...points.map(point => point.value), 1) * 1.12;
  const x = (age: number) => 70 + (age - minAge + .6) / (maxAge - minAge + 1.2) * 790;
  const y = (value: number) => 285 - value / top * 245;
  const step = Math.max(1, Math.ceil((maxAge - minAge) / 12));
  const ages = Array.from({ length: Math.floor((maxAge - minAge) / step) + 1 }, (_, index) => minAge + index * step);
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: display.digits });
  return <>
    <div className="workspace-testing-legend" aria-label="Chart legend">{TESTING_DIVISIONS.filter(division => division.key !== "unknown" || points.some(point => point.division === "unknown")).map(division => <span key={division.key}><i style={{ background: division.color }} />{division.label}</span>)}<span>Dots: players · Lines: average at each age</span></div>
    {points.length ? <div className="workspace-testing-chart-wrap"><svg className="workspace-testing-chart" viewBox="0 0 910 350" role="group" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{`${drillLabel(series.drill)} results by current age`}</title><desc id={`${id}-description`}>{points.length} players. Each dot is a player's best qualified result in the selected period. Lines connect division averages at each age. {series.lowerIsBetter ? "Lower" : "Higher"} is better. Values are in {display.unit}.</desc>
      {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line className="testing-grid" x1="70" x2="860" y1={y(top * fraction)} y2={y(top * fraction)} /><text x="59" y={y(top * fraction) + 4} textAnchor="end">{format(top * fraction)}</text></g>)}
      <text x="70" y="20">{display.unit} · {series.lowerIsBetter ? "lower" : "higher"} is better</text>
      {ages.map(age => <g key={age}><line className="testing-grid" x1={x(age)} x2={x(age)} y1="40" y2="285" /><text x={x(age)} y="309" textAnchor="middle">{age}</text></g>)}<text x="465" y="340" textAnchor="middle">Current age (years)</text>
      {trends.filter(trend => trend.points.length > 1).map(trend => <polyline key={trend.key} points={trend.points.map(point => `${x(point.age)},${y(point.value)}`).join(" ")} fill="none" stroke={trend.color} strokeWidth="2.5" strokeDasharray="6 4" opacity=".85"><title>{`${trend.label}: average result at each age`}</title></polyline>)}
      {points.map(point => { const color = TESTING_DIVISIONS.find(division => division.key === point.division)!.color; const label = `${point.name || "Player"}, age ${point.age}, ${TESTING_DIVISIONS.find(division => division.key === point.division)!.label}: ${format(point.value)} ${display.unit}`; return <circle key={point.playerId} cx={x(point.plottedAge)} cy={y(point.value)} r="4.5" fill={color} fillOpacity=".8" stroke="#0c1d16" strokeWidth="1.25" tabIndex={0} role="img" aria-label={label}><title>{label}</title></circle>; })}
    </svg></div> : <p className="workspace-testing-empty">No qualified results with a known age for this drill in the selected period.</p>}
    <p className="insights-note">{points.length.toLocaleString()} players shown{unknownAge > 0 ? ` · ${unknownAge.toLocaleString()} with unknown age not plotted` : ""}. Dots are spread slightly around each age so overlapping results remain visible. Current roster ages and divisions are used; lines compare age groups and do not measure individual improvement.</p>
  </>;
}

export function TestingStationAnalytics({ stations, pending = false }: { stations: AdminTesting["stations"] | undefined; pending?: boolean }) {
  return <section className="insights-card" aria-label="Station analytics"><div className="insights-section-title"><h2>Station analytics</h2><span>Sessions started in selected period</span></div>
    {stations === null || stations === undefined ? <p className="workspace-testing-empty">{pending ? "Loading station timing…" : "Station timing is unavailable in this report."}</p> : stations.length ? <div className="workspace-station-grid">{stations.map(station => <article className="workspace-station" key={station.id}><h3>{station.label || `Station ${station.order}`}</h3><strong>{playerDuration(station.elapsedMeanMs)}</strong><small>Average elapsed time per player · {station.timingSamples} timed {station.timingSamples === 1 ? "visit" : "visits"}</small><dl><div><dt>Player visits complete</dt><dd>{station.completedPlayers} / {station.eligiblePlayers}</dd></div><div><dt>Reps synced</dt><dd>{station.syncedReps} / {station.plannedReps}</dd></div><div><dt>Failed / partial runs</dt><dd>{station.failed} / {station.partial}</dd></div></dl><progress aria-label={`${station.label} reps synced`} max={Math.max(station.plannedReps, 1)} value={station.syncedReps} /></article>)}</div> : <p className="workspace-testing-empty">No station sessions were recorded for this selection.</p>}
    <AboutNumbers><p>Station time runs from first capture to final processing result and includes pauses between reps. Only complete reported timings contribute; missing uploads are not zero time. Each player-session is one visit. Progress reflects the latest records for sessions started in the selected period; past sync status is not reconstructed.</p></AboutNumbers>
  </section>;
}

export default function WorkspaceTesting({ data, request, onChange, hideSummary = false, detailsPending = false }: { data: ExpandedReportSummary; request: ExpandedRequest; onChange(patch: Partial<ExpandedRequest>): void; hideSummary?: boolean; detailsPending?: boolean }) {
  const extension = (data as ExpandedReportSummary & { adminTesting?: AdminTesting }).adminTesting;
  const analytics = extension?.version === 1 ? extension : undefined;
  const [drill, setDrill] = useState("shooting");
  const { testing } = data;
  const weekly = analytics?.weekly;
  const today = dateInZone(new Date(data.generatedAtMillis), data.period.timeZone);
  const currentWeek = data.period.endDate === today;
  const series = analytics?.performance.find(row => row.drill === drill);
  const weeks = weeklySeries(testing.days, ["distinctAttempts", "qualifyingTests"], data.period.startDate, data.period.endDate);
  const scope = data.testingMode === "cumulative" ? `Through ${data.period.endDate}` : `${data.period.startDate}–${data.period.endDate}`;
  return <div className="workspace-testing">
    {!hideSummary && <section className="insights-tiles workspace-testing-summary" aria-label="testing summary">
      <SummaryCard label="Fully tested" value={testing.statuses.find(row => row.key === "fullyTested")?.count || 0} note="All six exercises" />
      <SummaryCard label="Partially tested" value={testing.statuses.find(row => row.key === "partiallyTested")?.count || 0} note="One to five exercises" />
      <SummaryCard label="Qualifying results" value={testing.qualifyingTests} note={scope} />
      <SummaryCard label="Distinct recorded attempts" value={testing.distinctAttempts} note="Duplicates counted once" />
      <SummaryCard label={currentWeek ? "Players tested this week" : "Players tested in selected week"} value={weekly?.playersTested ?? (detailsPending ? "Loading…" : "Unavailable")} note={weekly ? `4+ distinct recorded drills · ${weekly.weekStart}–${weekly.weekEnd}; failures included` : "Four or more distinct recorded drills, including failures"} previous={weekly ? `Previous week: ${weekly.previousPlayersTested.toLocaleString()}` : detailsPending ? "Previous week: Loading…" : "Previous week: Unavailable"} />
      <SummaryCard label="Average time through stations" value={weekly ? playerDuration(weekly.rotation.meanMs) : detailsPending ? "Loading…" : "Unavailable"} note={weekly ? `${currentWeek ? "This week" : `Week of ${weekly.weekStart}`} · ${weekly.rotation.samples} timed complete rotations` : "Selected week · complete player rotations"} previous={weekly ? `Previous week: ${playerDuration(weekly.previousRotation.meanMs)} · ${weekly.previousWeekStart}–${weekly.previousWeekEnd} · ${weekly.previousRotation.samples} rotations` : detailsPending ? "Previous week: Loading…" : "Previous week: Unavailable"} />
    </section>}
    <div className="insights-grid"><BreakdownChart title="Testing coverage" slices={testing.statuses.map(row => ({ key: row.key, label: TESTING_LABELS[row.key] || row.key, value: row.count }))} selected={request.testingStatus} onSelect={testingStatus => onChange({ testingStatus })} note={`${data.roster.filtered.toLocaleString()} matching players · ${scope}. Select a category to filter the report.`} />
      <ActivityChart title="Players qualified by exercise" labels={testing.exercises.map(row => drillLabel(row.key))} series={[{ label: "Players qualified", values: testing.exercises.map(row => row.playersQualified) }]} unit="players" rowLabel="Exercise" note="A player can qualify in several exercises. A required valid primary result qualifies each exercise." /></div>
    <section className="insights-card"><div className="insights-section-title"><h2>Results by age</h2><label className="workspace-testing-select">Drill<select aria-label="Results by age drill" value={drill} onChange={event => setDrill(event.target.value)}>{EXERCISES.map(key => <option key={key} value={key}>{drillLabel(key)}</option>)}</select></label></div>
      <p className="insights-note">One best qualified result per player · {data.period.startDate}–{data.period.endDate}</p>
      {analytics ? <TestingAgeChart series={series || { drill, unit: ["shooting", "sprint"].includes(drill) ? "m/s" : ["jump", "broadJump"].includes(drill) ? "m" : "s", lowerIsBetter: ["changeOfDirection", "dribbling"].includes(drill), points: [] }} /> : <p className="workspace-testing-empty" role="status">{detailsPending ? "Loading results by age…" : "Results by age are unavailable in this report."}</p>}
    </section>
    <TestingStationAnalytics stations={analytics?.stations} pending={detailsPending} />
    <ActivityChart title="Testing activity by week" labels={weeks.labels} series={[{ label: "Distinct recorded attempts", values: weeks.values[0] }, { label: "Qualifying results", values: weeks.values[1] }]} unit="results" note="Recorded activity in the selected period, including partial boundary weeks." />
    <AboutNumbers><p>Dates use {data.period.timeZone}; weeks begin Monday. Weekly cards cover Monday through the selected end date; the comparison covers the same weekdays one week earlier. Complete rotations run from first capture at the first station to final result at the last station and include time between stations. Historical records follow current organization and team ownership. All totals cover the full filtered roster.</p></AboutNumbers>
  </div>;
}
