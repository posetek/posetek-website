import { useState, type CSSProperties, type ReactNode } from "react";
import { ordinal, testName, type Metric } from "../CoachStandings";
import { type createUsage, usageEnabled } from "./usage";
import { TeamAnalysis, type TeamAnalysisMode } from "./TeamAnalysis";
import { CompactFollowUp, Milestone } from "./CompactFollowUp";
import { hasScore, rosterName, type SharedAthlete, type SharedTeam } from "./reportData";
import "./team-results.css";

type RecordAction = Awaited<ReturnType<typeof createUsage>>;

function focusHeading(id: string) {
  const heading = document.getElementById(id);
  heading?.scrollIntoView({ block: "start" });
  heading?.focus({ preventScroll: true });
}

export function focusRoster(index: number) {
  focusHeading(`cr-roster-${index}`);
}

const shortDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fullDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function TestDate({ date, full = false }: { date: string; full?: boolean }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return <>{date}</>;
  const parsed = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime())) return <>{date}</>;
  return <time dateTime={date} title={date}>{(full ? fullDateFormat : shortDateFormat).format(parsed)}</time>;
}

function Chevron() {
  return <svg className="cr-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="m6 3.5 4.5 4.5L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function ScoreCell({ metric, fallbackDate }: { metric?: Metric; fallbackDate?: string }) {
  if (!hasScore(metric)) return <span className="cr-empty-score" aria-label="Unavailable">—</span>;
  const date = metric.date || fallbackDate;
  return <><b>{metric.result}</b>{date && <small><TestDate date={date}/></small>}</>;
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
          <div className="cr-profile-score"><strong>{reviewed ? metric.result : "Unavailable"}</strong></div>
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

function RosterResults({ team, index, children, onOpen }: {
  team: SharedTeam; index: number; children: ReactNode; onOpen: () => void;
}) {
  const tests = [...new Set(team.athletes.flatMap(athlete => athlete.report?.metrics.map(metric => testName(metric.label)) ?? []))];
  const playersWithResults = team.athletes.filter(athlete => athlete.report?.metrics.some(hasScore)).length;
  return <section className="cr-roster" id="cr-team-results" data-results-team={index} aria-labelledby={`cr-roster-${index}`}>
    <div className="cr-roster-heading">
      <h2 id={`cr-roster-${index}`} tabIndex={-1}>{rosterName(team)}</h2>
      <p><strong>{team.athletes.length}</strong> players <span aria-hidden="true">/</span> <strong>{playersWithResults}</strong> with results</p>
    </div>
    {children}
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
  </section>;
}

export function TeamResults({ teams, active, onSelectTeam, record }: {
  teams: SharedTeam[]; active: number; onSelectTeam: (team: number) => void; record: RecordAction;
}) {
  const [mode, setMode] = useState<TeamAnalysisMode>("standings");
  const selectedTeam = teams[active];
  return <main className="insights-shell cr-report">
    <div className="cr-heading">
      <div><p>{selectedTeam.club}</p><h1 id="cr-results-heading">Team results</h1><p className="cr-instruction">Select a player for their full results.</p></div>
      <dl className="cr-count"><dt>Players</dt><dd>{selectedTeam.athletes.length}</dd></dl>
    </div>
    <nav className="cr-jumps" aria-label="Report sections">
      {teams.length > 1 && teams.map((team, i) => <button key={team.team} type="button" aria-label={`Show ${rosterName(team)} roster`}
        aria-pressed={i === active} aria-controls="cr-team-results"
        onClick={() => { onSelectTeam(i); requestAnimationFrame(() => focusRoster(i)); }}>{rosterName(team)}</button>)}
      <button type="button" onClick={() => focusHeading("cr-follow-up-heading")}>Athlete follow-up <span aria-hidden="true">↓</span></button>
    </nav>
    <RosterResults key={selectedTeam.team} team={selectedTeam} index={active} onOpen={() => record("one-pager", active)}>
      <TeamAnalysis team={selectedTeam} mode={mode} onModeChange={setMode}/>
    </RosterResults>
    <section className="cr-follow-up" aria-labelledby="cr-follow-up-heading">
      <h2 id="cr-follow-up-heading" tabIndex={-1}>Athlete follow-up</h2>
      {teams.length > 1 && <div className="cr-activity-teams" role="group" aria-label="Activity roster">
        {teams.map((team, i) => <button key={team.team} type="button" aria-pressed={i === active} aria-controls={`cr-team-activity-${i}`}
          onClick={event => {
            const button = event.currentTarget;
            onSelectTeam(i);
            requestAnimationFrame(() => button.scrollIntoView({ block: "nearest" }));
          }}>{rosterName(team)}</button>)}
      </div>}
      {teams.map((team, index) => <div key={team.team} id={`cr-team-activity-${index}`} hidden={index !== active}>
        <CompactFollowUp team={team} index={index}/>
      </div>)}
    </section>
    {usageEnabled && <p className="cv-usage-note">PoseTek records demo opens and which controls are used. Player details and message text stay private.</p>}
  </main>;
}
