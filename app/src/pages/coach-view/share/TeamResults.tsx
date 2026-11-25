import { useState, type CSSProperties } from "react";
import { athleteCheckIn, CoachFollowUp } from "../CoachFollowUp";
import type { RosterAthlete } from "../CoachRoster";
import { CoachStandings, ordinal, testName, type Metric } from "../CoachStandings";
import { type createUsage, usageEnabled } from "./usage";
import "./team-results.css";

type Milestones = { signedIn: boolean | null; firstWorkoutCompleted: boolean | null };
type SharedAthlete = RosterAthlete & { followUp: boolean; activity?: Milestones };
export type SharedTeam = { layout?: string; team: string; shortName?: string; club: string; asOf: string; athletes: SharedAthlete[] };
type RecordAction = Awaited<ReturnType<typeof createUsage>>;

export function rosterName(team: SharedTeam) {
  return team.shortName || team.team.split(" — ")[0];
}

function focusHeading(id: string) {
  const heading = document.getElementById(id);
  heading?.scrollIntoView({ block: "start" });
  heading?.focus({ preventScroll: true });
}

export function focusRoster(index: number) {
  focusHeading(index === 0 ? "cr-results-heading" : `cr-roster-${index}`);
}

const shortDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fullDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function TestDate({ date, full = false }: { date: string; full?: boolean }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return <>{date}</>;
  const parsed = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime())) return <>{date}</>;
  return <time dateTime={date} title={date}>{(full ? fullDateFormat : shortDateFormat).format(parsed)}</time>;
}

function Milestone({ value }: { value?: boolean | null }) {
  if (value == null) return <span className="cr-status">Unconfirmed</span>;
  return <span className={value ? "cr-status is-done" : "cr-status"}>{value ? "Yes" : "Not yet"}</span>;
}

function Chevron() {
  return <svg className="cr-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="m6 3.5 4.5 4.5L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function hasScore(metric?: Metric): metric is Metric & { result: string } {
  const result = metric?.result?.trim();
  return Boolean(result && !/^(?:unavailable|unscored|not available|not recorded|n\/a|[-–—])$/i.test(result));
}

function ScoreCell({ metric, fallbackDate }: { metric?: Metric; fallbackDate?: string }) {
  if (!hasScore(metric)) return <span className="cr-empty-score" aria-label="Unavailable">—</span>;
  const date = metric.date || fallbackDate;
  return <><b>{metric.result}</b>{date && <small><TestDate date={date}/></small>}{metric.estimated && <small className="cr-estimate">Estimate</small>}</>;
}

function AthleteProfile({ athlete, tests, team }: { athlete: SharedAthlete; tests: string[]; team: SharedTeam }) {
  const report = athlete.report;
  return <div className="cr-profile">
    <h4>{athlete.name} <span>· {rosterName(team)}</span></h4>
    {report && report.metrics.some(hasScore) ? <ul className="cr-profile-grid">
      {tests.map(test => {
        const metric = report.metrics.find(m => testName(m.label) === test);
        const reviewed = hasScore(metric);
        const date = metric?.date || report.date;
        return <li className="cr-profile-metric" key={test}>
          <span>{test}</span>
          <div className="cr-profile-score"><strong>{reviewed ? metric.result : "Unavailable"}</strong>{reviewed && metric.estimated && <small>Estimate</small>}</div>
          {reviewed && <>
            {date && <small><TestDate date={date} full/></small>}
            {metric.percentile != null && <div className="cr-percentile"><i aria-hidden="true" style={{ width: `${Math.min(100, Math.max(0, metric.percentile))}%` }}/><span>{ordinal(metric.percentile)} percentile</span></div>}
            {metric.average && <small>{report.comparisonLabel || "Team average"} {metric.average}{metric.count != null && ` · ${metric.count} players`}</small>}
          </>}
        </li>;
      })}
    </ul> : <p className="cr-no-results">No reviewed results available.</p>}
    {report && report.notes.length > 0 && <details className="cr-measurement-notes"><summary>Measurement notes</summary>
      <ul>{report.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
    <dl className="cr-profile-activity">
      <div><dt>Signed in</dt><dd><Milestone value={athlete.activity?.signedIn}/></dd></div>
      <div><dt>First workout completed</dt><dd><Milestone value={athlete.activity?.firstWorkoutCompleted}/></dd></div>
    </dl>
    <small className="cr-asof">Activity as of {team.asOf}</small>
  </div>;
}

function SessionStandings({ team }: { team: SharedTeam }) {
  const dates = [...new Set(team.athletes.flatMap(athlete => athlete.report?.metrics
    .filter(metric => hasScore(metric) && metric.percentile != null)
    .map(metric => metric.date || athlete.report!.date) ?? []))].sort().reverse();
  const [choice, setChoice] = useState(dates[0]);
  const date = dates.includes(choice) ? choice : dates[0];
  if (!date) return null;
  const athletes = team.athletes.flatMap(athlete => {
    const report = athlete.report;
    if (!report) return [];
    const metrics = report.metrics.filter(metric => hasScore(metric) && (metric.date || report.date) === date);
    return metrics.some(metric => metric.percentile != null) ? [{ name: athlete.name, report: { ...report, metrics } }] : [];
  });
  return <details className="cr-standings">
    <summary>Compare session percentiles <Chevron/></summary>
    {dates.length > 1 && <label>Testing session <select value={date} onChange={event => setChoice(event.target.value)}>
      {dates.map(item => <option key={item}>{item}</option>)}</select></label>}
    {dates.length === 1 && <p><TestDate date={date} full/></p>}
    <p>Only results shown on this roster are plotted. Percentiles use the full comparison group for each test on that date.</p>
    <CoachStandings athletes={athletes}/>
  </details>;
}

function RosterResults({ team, index, onOpen }: { team: SharedTeam; index: number; onOpen: () => void }) {
  const tests = [...new Set(team.athletes.flatMap(athlete => athlete.report?.metrics.map(metric => testName(metric.label)) ?? []))];
  const playersWithResults = team.athletes.filter(athlete => athlete.report?.metrics.some(hasScore)).length;
  return <section className="cr-roster" data-results-team={index} aria-labelledby={`cr-roster-${index}`}>
    <div className="cr-roster-heading">
      <h2 id={`cr-roster-${index}`} tabIndex={-1}>{rosterName(team)}</h2>
      <p><strong>{team.athletes.length}</strong> players <span aria-hidden="true">/</span> <strong>{playersWithResults}</strong> with results</p>
    </div>
    <div className="cr-score-list" style={{ "--cr-count": Math.max(1, tests.length) } as CSSProperties}>
      <div className="cr-grid cr-labels" aria-hidden="true"><span>Player</span>
        {tests.map(test => <span key={test}>{test}</span>)}<span/></div>
      {team.athletes.map((athlete, player) => {
        const metrics = athlete.report?.metrics ?? [];
        const scores = metrics.filter(hasScore);
        const highlight = scores.find(metric => testName(metric.label) === "Sprint") ?? scores[0];
        return <details key={player} className="cr-player" name="team-result-profiles">
          <summary className="cr-grid" aria-label={`Open ${athlete.name} profile`}
            onClick={event => { if (!event.currentTarget.parentElement?.hasAttribute("open")) onOpen(); }}>
            <span className="cr-name"><strong>{athlete.name}</strong>
              <small>{scores.length === 0 ? "No reviewed results" : `${scores.length} of ${tests.length} tests`}</small>
            </span>
            {tests.map(test => {
              const metric = metrics.find(item => testName(item.label) === test);
              return <span className="cr-score-cell" key={test}><ScoreCell metric={metric} fallbackDate={athlete.report?.date}/></span>;
            })}
            <span className="cr-mobile-score">{highlight && <><span>{testName(highlight.label)}</span><ScoreCell metric={highlight} fallbackDate={athlete.report?.date}/></>}</span>
            <Chevron/>
          </summary>
          <AthleteProfile athlete={athlete} team={team} tests={tests}/>
        </details>;
      })}
      {team.athletes.length === 0 && <p className="cr-no-results">No players on this roster.</p>}
    </div>
    <SessionStandings team={team}/>
  </section>;
}

function AthleteFollowUp({ team, index }: { team: SharedTeam; index: number }) {
  return <section className="cr-team-activity" aria-label={`${rosterName(team)} activity`}>
    <div className="cr-activity-heading"><h3>{rosterName(team)}</h3><span>As of {team.asOf}</span></div>
    <table className="cr-activity-table"><thead><tr><th scope="col">Player</th><th scope="col">Signed in</th><th scope="col">First workout completed</th></tr></thead>
      <tbody>{team.athletes.map((athlete, i) => <tr className="cr-activity-row" key={i}><th scope="row">{athlete.name}</th>
        <td><Milestone value={athlete.activity?.signedIn}/></td><td><Milestone value={athlete.activity?.firstWorkoutCompleted}/></td></tr>)}</tbody>
    </table>
    {team.athletes.length > 0 && <details className="cr-message-demo">
      <summary>Try a team message <Chevron/></summary>
      <CoachFollowUp items={team.athletes.map(athlete => athleteCheckIn(athlete.name, "Team check-in"))}
        heading="Message athletes" idSuffix={`-review-${index}`}/>
    </details>}
  </section>;
}

export function TeamResults({ teams, active, onSelectTeam, record }: {
  teams: SharedTeam[]; active: number; onSelectTeam: (team: number) => void; record: RecordAction;
}) {
  const club = [...new Set(teams.map(team => team.club))].join(" · ");
  const total = teams.reduce((count, team) => count + team.athletes.length, 0);
  return <main className="insights-shell cr-report">
    <div className="cr-heading">
      <div><p>{club}</p><h1 tabIndex={-1} id="cr-results-heading">Team results</h1><p className="cr-instruction">Select a player for their full results.</p></div>
      <dl className="cr-count"><dt>Players</dt><dd>{total}</dd></dl>
    </div>
    <nav className="cr-jumps" aria-label="Report sections">
      {teams.length > 1 && teams.map((team, i) => <button key={i} type="button" aria-label={`Jump to ${rosterName(team)} roster`}
        onClick={() => { onSelectTeam(i); focusRoster(i); }}>{rosterName(team)}</button>)}
      <button type="button" onClick={() => focusHeading("cr-follow-up-heading")}>Athlete follow-up <span aria-hidden="true">↓</span></button>
    </nav>
    {teams.map((team, i) => <RosterResults key={i} team={team} index={i} onOpen={() => {
      onSelectTeam(i);
      record("one-pager", i);
    }}/>)}
    <section className="cr-follow-up" aria-labelledby="cr-follow-up-heading">
      <h2 id="cr-follow-up-heading" tabIndex={-1}>Athlete follow-up</h2>
      {teams.length > 1 && <div className="cr-activity-teams" role="group" aria-label="Activity roster">
        {teams.map((team, i) => <button key={i} aria-pressed={i === active} onClick={() => onSelectTeam(i)}>{rosterName(team)}</button>)}
      </div>}
      {teams.map((team, i) => <div key={i} hidden={active !== i}><AthleteFollowUp team={team} index={i}/></div>)}
    </section>
    {usageEnabled && <p className="cv-usage-note">PoseTek records demo opens and which controls are used. Player details and message text stay private.</p>}
  </main>;
}
