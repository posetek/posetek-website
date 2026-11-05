import { useEffect, useId, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { AboutNumbers } from "./BreakdownChart";
import { CHART_AXIS, CHART_THEME } from "./chartTheme";
import { shortDate } from "./lib/expanded";
import { DAILY_USAGE_RANGES, USAGE_CATEGORIES, dailyUsageWindow } from "./lib/dailyUsage";
import type { DailyUsageHistory, DailyUsageInput, DailyUsageMode, DailyUsageRange } from "./lib/dailyUsage";
import "./DailyUsageChart.scss";

export default function DailyUsageChart({ days, period, history }: {
  days: DailyUsageInput[];
  history?: DailyUsageHistory;
  period: { startDate: string; endDate: string; timeZone: string };
}) {
  const [range, setRange] = useState<DailyUsageRange>("1m");
  const [mode, setMode] = useState<DailyUsageMode>("categories");
  const id = useId(), canvas = useRef<HTMLCanvasElement>(null);
  const window = useMemo(() => dailyUsageWindow(days, period, range, history), [days, period, range, history]);
  const categoryMode = mode === "categories";
  const hasData = categoryMode ? window.categoryDays > 0 : window.measuredDays > 0;
  const format = (value: number | null) => value === null ? "Not collected" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  useEffect(() => {
    if (!canvas.current || !hasData) return;
    const datasets = categoryMode
      ? USAGE_CATEGORIES.map(category => ({ label: category.label, data: window.rows.map(row => row.categories?.[category.key] ?? null), backgroundColor: category.color }))
      : [{ label: "Total estimated active use", data: window.rows.map(row => row.total), backgroundColor: CHART_THEME.accent }];
    const chart = new Chart(canvas.current, {
      type: "bar", data: { labels: window.rows.map(row => shortDate(row.date)), datasets: datasets.map(dataset => ({ ...dataset, maxBarThickness: 30, borderRadius: 2, borderSkipped: false })) },
      options: {
        maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => `${item.dataset.label}: ${item.formattedValue} min` } } },
        scales: {
          x: { ...CHART_AXIS, stacked: categoryMode, grid: { display: false }, ticks: { ...CHART_AXIS.ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 9 } },
          y: { ...CHART_AXIS, stacked: categoryMode, beginAtZero: true, title: { display: true, text: "Minutes", color: CHART_THEME.text } },
        },
      },
    });
    return () => chart.destroy();
  }, [window, categoryMode, hasData]);
  return <section className="insights-card daily-usage" aria-labelledby={id}>
    <div className="insights-section-title"><div><h2 id={id}>Estimated active use by day</h2><p className="daily-usage-period">{shortDate(window.startDate)}–{shortDate(window.endDate)} · {period.timeZone}</p></div>
      <div className="daily-usage-controls">
        <div className="daily-usage-segment" role="group" aria-label="Daily usage range">{DAILY_USAGE_RANGES.map(option => <button key={option.key} type="button" aria-label={option.label} aria-pressed={range === option.key} onClick={() => setRange(option.key)}>{option.key}</button>)}</div>
        <div className="daily-usage-segment" role="group" aria-label="Daily usage display"><button type="button" aria-pressed={categoryMode} onClick={() => setMode("categories")}>By category</button><button type="button" aria-pressed={!categoryMode} onClick={() => setMode("total")}>Total</button></div>
      </div>
    </div>
    {window.clipped && <p className="daily-usage-note">Showing available dates in the selected report period. Extended daily history is unavailable in this response; refresh reporting or choose an earlier report start date to see the full range.</p>}
    {categoryMode && hasData && <ul className="daily-usage-legend" aria-label="Usage categories">{USAGE_CATEGORIES.map(category => <li key={category.key}><i aria-hidden="true" style={{ background: category.color }} />{category.label}</li>)}</ul>}
    {hasData ? <div className="insights-chart daily-usage-chart"><canvas ref={canvas} aria-hidden="true" /></div> : <div className="insights-uncollected"><strong>{categoryMode && window.measuredDays ? "Daily category detail unavailable" : "Not collected"}</strong><p>{categoryMode && window.measuredDays ? "This report has daily totals, but no daily feature breakdown. Select Total to see measured activity." : "This range has no measured daily usage."}</p></div>}
    {categoryMode && window.categoryDays > 0 && window.categoryDays < window.measuredDays && <p className="daily-usage-note">Some measured days have no category detail. Their totals remain available in Total and the data table.</p>}
    <AboutNumbers><p>Daily totals count overlapping website and iOS use once. Category bars divide that same measured time; missing collection is not zero activity. Training combines workouts, training, video and planning. Profile &amp; overview uses the recorded overview feature; Social uses the feed. These are app-use minutes, not workout duration.</p><p>Ranges end on the selected report end date. 1m and 2m use calendar months. When extended daily history is available, the same reporting group is shown across the full daily range, independently of the report start date. Weekly charts and period totals keep the selected report period. Dates use {period.timeZone}.</p></AboutNumbers>
    <details className="insights-data-table"><summary>View daily chart data</summary><div className="insights-table-wrap"><table className="insights-table"><caption className="insights-sr-only">Estimated active use by day, in minutes</caption><thead><tr><th scope="col">Date</th><th scope="col">Total (minutes)</th>{categoryMode && USAGE_CATEGORIES.map(category => <th scope="col" key={category.key}>{category.label} (minutes)</th>)}</tr></thead><tbody>{window.rows.map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{format(row.total)}</td>{categoryMode && USAGE_CATEGORIES.map(category => <td key={category.key}>{row.categories ? format(row.categories[category.key]) : row.total === null ? "Not collected" : "Unavailable"}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}
