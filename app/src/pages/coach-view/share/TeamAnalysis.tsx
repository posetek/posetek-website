import { useId, useState } from "react";
import { ordinal, testName } from "../CoachStandings";
import { formatTestingWindow, hasScore, rosterName, type SharedTeam, type TeamAgeSeries, type TeamJumpComparison } from "./reportData";
import "./team-analysis.css";

export type TeamAnalysisMode = "standings" | "pathway";
type Selection = { test: string; date?: string };
type Standing = { test: string; date: string; name: string; result: string; percentile: number };
const modes = { standings: "Team standings", pathway: "Development pathway" } as const;
const modeKeys = Object.keys(modes) as TeamAnalysisMode[];
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function showDate(date: string) {
  const time = new Date(date + "T12:00:00Z");
  return Number.isFinite(time.getTime()) ? dateFormat.format(time) : date;
}

function standingRows(team: SharedTeam): Standing[] {
  const { testingWindow } = team;
  return team.athletes.flatMap(({ name, report }) => report?.metrics.flatMap(metric => {
    const date = metric.date || report.date;
    const percentile = metric.percentile;
    if (!hasScore(metric) || !date || percentile == null || !Number.isFinite(percentile) ||
        percentile < 0 || percentile > 100) return [];
    if (testingWindow && (date < testingWindow.startDate || date > testingWindow.endDate)) return [];
    return [{ name, test: testName(metric.label), date, result: metric.result, percentile }];
  }) ?? []);
}

function preferredSeries(a: TeamAgeSeries, b: TeamAgeSeries) {
  return Number(b.groups.length >= 2) - Number(a.groups.length >= 2) ||
    b.date.localeCompare(a.date) || Number(b.test === "Vertical jump") - Number(a.test === "Vertical jump");
}

function StandingsChart({ rows, pooled }: { rows: Standing[]; pooled: boolean }) {
  const ranked = [...rows].sort((a, b) => b.percentile - a.percentile || a.name.localeCompare(b.name));
  return <>
    <div className="cr-standing-headers" aria-hidden="true">
      <span>Player</span><span>Percentile (0–100)</span><span>Result</span>
    </div>
    <div className="cr-standing-scroll" tabIndex={0} role="region" aria-label="Players ordered by percentile">
      <ol className="cr-standing-list">
        {ranked.map(({ name, result, percentile }, i) =>
          <li className="cr-standing-row" key={i} data-percentile={percentile}>
            <span className="cr-standing-name">{name}</span>
            <span className="cr-standing-rank">
              <span className="cr-standing-track" aria-hidden="true"><i style={{ width: percentile + "%" }}/></span>
              <b>{ordinal(percentile)}<span className="cr-chart-sr"> percentile</span></b>
            </span>
            <span className="cr-standing-value">{result}</span>
          </li>)}
      </ol>
    </div>
    <p className="cr-chart-note">{pooled
      ? `Percentiles compare ${playerCount(ranked.length)} on this team across the testing window.`
      : "Percentiles use each player’s original testing group."}</p>
  </>;
}

function playerCount(count: number) {
  return count + (count === 1 ? " player" : " players");
}

function PathwayChart({ series, teamName, club }: { series: TeamJumpComparison; teamName: string; club: string }) {
  const { groups, teamMean, teamCount, unit } = series;
  const maximum = Math.max(...groups.map(group => group.mean), teamMean ?? 0);
  const increment = 10 ** Math.floor(Math.log10(maximum)) / 2;
  const ceiling = maximum > 0 ? Math.ceil(maximum / increment) * increment : 1;
  const axis = unit === "in" ? "Mean jump height (inches)" : "Mean jump distance (feet)";
  return <div className="cr-pathway">
    <p className="cr-pathway-legend"><span className="cr-age-key">{club} age averages</span>
      <span className="cr-team-average" data-available={teamMean != null}>{teamName} average{teamMean == null ? " unavailable" :
        <> <strong>{numberFormat.format(teamMean)} {unit}</strong> · {playerCount(teamCount)}</>}</span>
    </p>
    <p className="cr-pathway-axis">{axis}</p>
    <div className="cr-age-plot">
      <div className="cr-age-ruler" aria-hidden="true">
        {[0, .5, 1].map(ratio => <span key={ratio} style={{ bottom: ratio * 100 + "%" }}>{numberFormat.format(ratio * ceiling)}</span>)}
      </div>
      <div className="cr-age-grid">
        <ul className="cr-age-columns" aria-label="School averages by age">
          {groups.map(({ age, mean, count }) =>
            <li className="cr-age-column" key={age} data-age={age}>
              <div className="cr-age-label"><b>Age {age}</b><small>{playerCount(count)}</small></div>
              <div className="cr-age-bar" style={{ height: mean / ceiling * 100 + "%" }}>
                <strong className="cr-age-value">{numberFormat.format(mean)} {unit}</strong>
              </div>
            </li>)}
        </ul>
        {teamMean != null && <div aria-hidden="true" className="cr-average-line" style={{ bottom: teamMean / ceiling * 100 + "%" }}/>}
      </div>
    </div>
    <p className="cr-age-axis">Recorded age (years) · At least 5 players per age group</p>
  </div>;
}

export function TeamAnalysis({ team, mode, onModeChange }: {
  team: SharedTeam; mode: TeamAnalysisMode; onModeChange: (mode: TeamAnalysisMode) => void;
}) {
  const chartId = useId();
  const teamName = rosterName(team);
  const [selections, setSelections] = useState<Partial<Record<TeamAnalysisMode, Selection>>>({});
  const { testingWindow } = team;
  const standings = standingRows(team);
  const datedPathway = (team.pathway ?? []).filter(series => series.groups.length > 0).sort(preferredSeries);
  const pathway = testingWindow ? testingWindow.pathway.filter(series => series.groups.length > 0) : datedPathway;
  const isPathway = mode === "pathway";
  const records = isPathway ? pathway : standings;
  const tests = [...new Set(records.map(row => row.test))];
  const selection = selections[mode];
  const preferredTest = tests.includes("Vertical jump") ? "Vertical jump" : tests[0];
  const defaultTest = isPathway && !testingWindow ? datedPathway[0]?.test : preferredTest;
  const test = selection && tests.includes(selection.test) ? selection.test : defaultTest;

  let dates: string[] = [];
  let date: string | undefined;
  if (!testingWindow) {
    const datedRecords = isPathway ? datedPathway : standings;
    dates = [...new Set(datedRecords.filter(row => row.test === test).map(row => row.date))].sort().reverse();
    const preferredDate = isPathway ? datedPathway.find(series => series.test === test)?.date : dates[0];
    date = selection?.date && dates.includes(selection.date) ? selection.date : preferredDate;
  }
  const period = testingWindow ? formatTestingWindow(testingWindow) : date && showDate(date);
  const series = testingWindow ? pathway.find(row => row.test === test) : datedPathway.find(row => row.test === test && row.date === date);
  const rows = standings.filter(row => row.test === test && (testingWindow || row.date === date));
  function select(next: Selection) {
    setSelections(previous => ({ ...previous, [mode]: next }));
  }
  let chart;
  if (isPathway && series) {
    chart = <PathwayChart series={series} teamName={teamName} club={team.club}/>;
  } else if (!isPathway && rows.length) {
    chart = <StandingsChart rows={rows} pooled={Boolean(testingWindow)}/>;
  } else {
    chart = <p className="cr-chart-note">{isPathway ? "No age-group jump averages were published for this team." : "No published percentiles for this team."}</p>;
  }
  return <section className="cr-analysis" aria-label={teamName + " analysis"}>
    <div className="cr-analysis-toolbar">
      <div className="cr-chart-modes" role="group" aria-label="Chart view">
        {modeKeys.map(key => <button key={key} type="button" aria-pressed={mode === key} aria-controls={chartId}
          onClick={() => onModeChange(key)}>{modes[key]}</button>)}
      </div>
      {(test || testingWindow) && <div className="cr-chart-filters">
        {test && <label>Test<select aria-label="Test" value={test} onChange={e => select({ test: e.target.value, date })}>
          {tests.map(name => <option key={name}>{name}</option>)}
        </select></label>}
        {testingWindow && <div className="cr-chart-window"><span>Testing window</span><strong>{period}</strong></div>}
        {test && date && <label>Session<select aria-label="Session" value={date} onChange={e => select({ test, date: e.target.value })}>
          {dates.map(day => <option key={day} value={day}>{showDate(day)}</option>)}
        </select></label>}
      </div>}
    </div>
    <figure className="cr-analysis-chart" id={chartId} aria-label={[teamName, modes[mode], test, period].filter(Boolean).join(" · ")}>
      {chart}
    </figure>
  </section>;
}
