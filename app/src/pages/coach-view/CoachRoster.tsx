import { ReportBody, type OnePager } from "./CoachStandings";

export type RosterAthlete = {
  name: string;
  workouts: number;
  testingAttempts: number;
  report?: OnePager;
};

export function CoachRoster({ athletes, groupName = "coach-roster" }: { athletes: RosterAthlete[]; groupName?: string }) {
  return (
    <section className="insights-card cv-roster">
      <div className="card-heading"><div><h2>Team roster</h2><p>Select an athlete to open their one-pager.</p></div><span>{athletes.length} roster entries</span></div>
      <div className="cv-roster-scroll" role="region" aria-label="Team roster" tabIndex={0}>
        {athletes.map(a => <details name={groupName} key={a.name}>
          <summary><strong>{a.name}</strong><span>{a.report?.metrics.filter(m => m.percentile != null).length ?? 0} ranked tests</span><span className="cv-chevron" aria-hidden="true">⌄</span></summary>
          <div className="cv-player-report">
            <h3>Player one-pager</h3>
            <p>{a.workouts} completed workouts · {a.testingAttempts} saved test attempts</p>
            {a.report ? <ReportBody report={a.report} /> : <p>One-pager unavailable for this athlete.</p>}
          </div>
        </details>)}
      </div>
    </section>
  );
}
