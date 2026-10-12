import { useMemo } from "react";
import type { AthleteSummary } from "../coach-dashboard/lib/logic";
import type { ExpandedPlayer, CoachTestScore } from "./lib/expanded";
import { coachPlanLabel, coachSessionRows, completedWorkoutsInPeriod, summaryDateLabel, validSummaryDay } from "./lib/coachPlayerSummary";

import CoachMeasuredTests from './CoachMeasuredTests';
import { coachFollowUp, coachTestingLabel } from './lib/coachFollowUp';

export default function CoachPlayerOneScreen({ summary, performance, period, generatedAtMillis = Date.now(), onPrescribe, disabled = false }: {
  summary: AthleteSummary; performance?: ExpandedPlayer["performance"]; testScores?: CoachTestScore[];
  period?: { startDate?: string; endDate: string; timeZone: string }; generatedAtMillis?: number; onPrescribe: () => void; disabled?: boolean;
}) {
  const plan = summary.plan, asOf = Number.isFinite(generatedAtMillis) ? generatedAtMillis : Date.now();
  const history = useMemo(() => coachSessionRows(summary, asOf, period?.timeZone || "UTC"), [summary, asOf, period?.timeZone]);
  const reasons = coachFollowUp(performance);
  const currentName = `${summary.athlete?.firstName || "Player"} ${summary.athlete?.lastName || ""}`.trim();
  const coachNote = plan?.coachNote || plan?.coachNotes || plan?.intake?.coachNote;
  const recordedTest = plan?.nextTestDate || plan?.retestDate || plan?.assessment?.nextTestDate;
  const nextTest = validSummaryDay(recordedTest) ? recordedTest : null;
  const trainingKnown = performance?.activePlan && performance.sessionsDone !== null && performance.sessionsPlanned !== null;
  const completed = completedWorkoutsInPeriod(summary.logs || [], period, asOf);
  return <section className="coach-player-one-screen" aria-label="Player progress at a glance">
    <header className="coach-player-glance-heading"><h2>{currentName}</h2><button className="primary-cta" type="button" onClick={onPrescribe} disabled={disabled}>Prescribe workouts</button></header>
    <div className="coach-player-workout-total"><div><span>Completed workouts</span><strong>{completed === null ? 'Unavailable' : completed}</strong></div><p>Personal, assigned and extra sessions{period?.startDate && ` · ${period.startDate}–${period.endDate} · ${period.timeZone}`}.</p></div>
    <dl className="coach-snapshot-stats coach-player-summary" aria-label={`${currentName}: workout and testing follow-up`}>
      <div className={reasons?.length ? "coach-snapshot-need" : ""}><dt>Needs you</dt><dd className="coach-snapshot-value">{reasons === null ? "�" : reasons.length ? "Review" : "No flags"}</dd><dd>{reasons === null ? "Follow-up unavailable" : reasons.length ? <ul className="coach-needs-you">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : "No workout or testing flags"}</dd></div>
      <div><dt>Recent testing</dt><dd className="coach-snapshot-value coach-testing-status">{coachTestingLabel(performance)}</dd><dd>Latest two comparable dates for each test</dd></div>
      <div><dt>Current-plan progress</dt>{!performance ? <><dd className="coach-snapshot-value">—</dd><dd>Training unavailable</dd></> : performance.activePlan ? <>
        <dd className="coach-snapshot-value">{trainingKnown ? <>{performance.sessionsDone}<small> of {performance.sessionsPlanned}</small></> : "—"}</dd>
        <dd>{trainingKnown ? "Assigned plan · last 14 days" : performance.sessionsDone === null ? "Completion unavailable" : "Schedule unavailable"}</dd><dd>{coachPlanLabel(plan, asOf)}</dd>
      </> : <><dd className="coach-snapshot-value">—</dd><dd>No active plan · <button type="button" className="insights-text-button" onClick={onPrescribe} disabled={disabled}>Create one</button></dd></>}</div>
    </dl>
    <CoachMeasuredTests performance={performance} />
    <div className="coach-player-glance-lower">
      <section className="coach-player-session-strip" aria-label="Last six sessions"><h3>Last six sessions</h3>{history.length ? <ol>{history.map(row => <li key={row.id} className={`is-${row.status.toLowerCase().replaceAll(" ", "-")}`} title={row.title}><strong>{row.status}</strong><span>{summaryDateLabel(row.date, true)}</span></li>)}</ol> : <p>No recent sessions recorded{plan && "; missed sessions need a confirmed schedule"}.</p>}</section>
      <section className="coach-player-coach-notes"><h3>Coach note & next test</h3><p><strong>Coach note:</strong> {typeof coachNote === "string" && coachNote.trim() ? coachNote : "No coach note recorded"}</p><p><strong>Next test:</strong> {summaryDateLabel(nextTest)}</p></section>
    </div>
  </section>;
}
