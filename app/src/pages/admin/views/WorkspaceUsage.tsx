import { useMemo } from "react";
import { AboutNumbers, ActivityChart, BreakdownChart } from "../../insights/BreakdownChart";
import DailyUsageChart from "../../insights/DailyUsageChart";
import { USAGE_LABELS, platformSlices, weeklySeries } from "../../insights/lib/expanded";
import type { ExpandedReportSummary } from "../../insights/lib/expanded";
import type { ExpandedRequest } from "../../insights/lib/expandedQuery";
import { USAGE_CATEGORIES, dailyUsageCategories } from "../../insights/lib/dailyUsage";

/** Admin usage evidence; summary cards and the player table belong to its caller. */
export default function WorkspaceUsage({ data, request, onChange }: {
  data: ExpandedReportSummary; request: ExpandedRequest; onChange: (patch: Partial<ExpandedRequest>) => void;
}) {
  const { usage } = data;
  const weeks = useMemo(() => weeklySeries(usage.days, ["webMinutes", "iosMinutes"], data.period.startDate, data.period.endDate, [usage.webCollectedPlayers > 0, usage.iosCollectedPlayers > 0]), [usage, data.period]);
  const categories = dailyUsageCategories({ date: data.period.endDate, activeMinutes: usage.activeMinutes, featureMinutes: usage.featureMinutes });
  return <>
    <div className="insights-grid">
      <BreakdownChart title="Player engagement" slices={usage.statuses.map(row => ({ key: row.key, label: USAGE_LABELS[row.key] || row.key, value: row.count }))} selected={request.usageStatus} onSelect={usageStatus => onChange({ usageStatus })} note="Returning means at least two active local days. No active use requires collection coverage; missing collection is separate." />
      {usage.collectedPlayers > 0 ? <BreakdownChart title="Active use by platform" slices={platformSlices(usage)} selected={request.usagePlatform} onSelect={usagePlatform => onChange({ usagePlatform })} unit="minutes" note="Website only, iOS only and overlap are mutually exclusive. Select a segment to see players with time in that category." /> : <section className="insights-card"><h2>Active use by platform</h2><div className="insights-uncollected"><strong>Not collected</strong><p>Usage starts when each platform sends measured activity. Earlier time cannot be reconstructed from testing records.</p></div></section>}
    </div>
    <AboutNumbers><p>Website: {usage.webCollectedPlayers ? `${usage.webCollectedPlayers} players with collection` : "Not collected"} · iOS app: {usage.iosCollectedPlayers ? `${usage.iosCollectedPlayers} players with collection` : "Not collected"}.{usage.collectionStartedAtMillis ? ` Collection began ${new Date(usage.collectionStartedAtMillis).toLocaleDateString("en-US", { timeZone: data.period.timeZone })}.` : " No collection is available in this period."}</p></AboutNumbers>
    <ActivityChart title="Estimated active use by week" labels={weeks.labels} series={[{ label: "Website", values: weeks.values[0] }, { label: "iOS app", values: weeks.values[1] }]} unit="minutes" note="Platform series can overlap. Total estimated active use counts simultaneous use once." />
    <DailyUsageChart days={usage.days} period={data.period} history={data.adminReporting?.dailyUsage} />
    {usage.collectedPlayers > 0 && categories && <BreakdownChart title="Estimated active use by category" slices={USAGE_CATEGORIES.map(category => ({ ...category, value: categories[category.key] }))} unit="minutes" note="Categories divide measured active time across the full selected report period. Training combines workouts, training, video and planning; Social uses the feed; Profile & overview uses the overview feature. Each interval is counted once. These are app-use minutes, not workout duration." />}
    <AboutNumbers><p>Dates use {data.period.timeZone}; weeks begin Monday. Historical records follow current organization and team ownership. Updated {new Date(data.generatedAtMillis).toLocaleString("en-US", { timeZone: data.period.timeZone })}. Totals cover the complete filtered reporting roster.</p></AboutNumbers>
  </>;
}
