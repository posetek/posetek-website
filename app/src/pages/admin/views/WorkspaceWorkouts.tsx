import { useMemo } from "react";
import { AboutNumbers, ActivityChart, BreakdownChart } from "../../insights/BreakdownChart";
import { WORKOUT_LABELS, weeklySeries, workoutDurationText, workoutOutcomeSlices } from "../../insights/lib/expanded";
import type { ExpandedReportSummary } from "../../insights/lib/expanded";
import type { ExpandedRequest } from "../../insights/lib/expandedQuery";

/** Admin workout evidence; its caller owns summary cards and the player table. */
export default function WorkspaceWorkouts({ data, request, onChange }: {
  data: ExpandedReportSummary; request: ExpandedRequest; onChange: (patch: Partial<ExpandedRequest>) => void; hideSummary?: boolean;
}) {
  const { workouts } = data;
  const statuses = useMemo(() => workouts.statuses.map(row => ({ key: row.key, label: row.key === "completed" ? "Has a completed log" : WORKOUT_LABELS[row.key] || row.key, value: row.count })), [workouts.statuses]);
  const outcomes = useMemo(() => workoutOutcomeSlices(workouts), [workouts]);
  const outcomeCount = workouts.outcomeEvents ?? outcomes.reduce((sum, row) => sum + row.value, 0);
  const weeks = useMemo(() => weeklySeries(workouts.days, ["started", "completed"], data.period.startDate, data.period.endDate), [workouts.days, data.period]);
  const coverage = (records: number | undefined, source: string) => records === undefined ? `${source} coverage unavailable` : `${records}/${outcomeCount} logs with ${source}`;
  return <>
    <p className="insights-note">Counts cover saved workout logs and sessions recorded on a player’s phone: repeats of a finished workout, yoga, runs, rides and walks, once the app has synced them. Completed as logged means the workout was ended as completed, or a phone session ended with recorded work; it does not confirm every prescribed set was done.</p>
    <div className="insights-grid">
      <BreakdownChart title="Player workout status" slices={statuses} selected={request.workoutStatus} onSelect={workoutStatus => onChange({ workoutStatus })}
        note={`${data.roster.filtered.toLocaleString()} matching players. One status per player: completed takes priority, then no ending record, ended early, abandoned, none. Select a category to filter players. An open log does not mean the player is training now.`} />
      <BreakdownChart title="Workout outcomes" slices={outcomes} unit="logs"
        note={`${outcomeCount.toLocaleString()} distinct workouts: ended in this period, or started in this period with no ending record. A player may have several outcomes. Linked duplicate logs count once.`} />
    </div>
    <ActivityChart title="Workout activity by week" labels={weeks.labels} series={[{ label: "Started", values: weeks.values[0] }, { label: "Completed as logged", values: weeks.values[1] }]} unit="logs"
      note="Starts use the recorded start date; completions use the recorded end date. A workout may start before this period and finish within it. These series do not measure workout generation or a completion rate." />
    <AboutNumbers>
      <p>Timer duration: {workoutDurationText(workouts.timerMinutes, workouts.timerRecords)} · {coverage(workouts.timerRecords, "timers")}. Estimated duration: {workoutDurationText(workouts.estimatedMinutes, workouts.estimatedRecords)} · {coverage(workouts.estimatedRecords, "estimates")}. {workouts.unknownDuration}/{outcomeCount} logs have unknown duration.</p>
      <p>Timer duration uses recorded active time. Estimates use elapsed start-to-end time when a timer is missing. These sources are kept separate from each other and from website or app activity. {workouts.duplicateLogs.toLocaleString()} duplicate logs were excluded. Generated workouts are not measured in this report.</p>
      <p>Dates use {data.period.timeZone}; weeks begin Monday. Historical records follow current organization and team ownership. Totals cover the complete filtered reporting roster. Updated {new Date(data.generatedAtMillis).toLocaleString("en-US", { timeZone: data.period.timeZone })}.</p>
    </AboutNumbers>
  </>;
}
