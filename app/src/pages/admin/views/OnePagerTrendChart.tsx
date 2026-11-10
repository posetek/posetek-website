import { useEffect, useId, useMemo, useRef } from "react";
import Chart from "chart.js/auto";
import type { Plugin } from "chart.js";
import { ONE_PAGER_METRICS, ONE_PAGER_SENT_COLOR, ONE_PAGER_TIME_ZONE, onePagerTicks } from "../lib/onePagerTrend";
import type { OnePagerTrendPoint } from "../lib/onePagerTrend";

const SERIES = [
  { field: "sent", label: "Reports sent", color: ONE_PAGER_SENT_COLOR },
  ...ONE_PAGER_METRICS.map(({ field, label, color }) => ({ field, label, color })),
] as const;
const day = new Intl.DateTimeFormat("en-US", { timeZone: ONE_PAGER_TIME_ZONE, month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat("en-US", { timeZone: ONE_PAGER_TIME_ZONE, hour: "numeric", minute: "2-digit" });
// Browsers join a combined date and time differently ("," or "at"); join them here.
const moment = { format: (at: number) => `${day.format(at)}, ${clock.format(at)}` };

/** Cumulative step lines: how many of the sent reports have a first open or click so far. */
export default function OnePagerTrendChart({ points }: { points: OnePagerTrendPoint[] }) {
  const id = useId(), canvas = useRef<HTMLCanvasElement>(null);
  const latest = points.at(-1)!;
  const start = points[0].at, end = latest.at;
  const ticks = useMemo(() => onePagerTicks(start, end), [start, end]);
  useEffect(() => {
    if (!canvas.current) return;
    const style = getComputedStyle(canvas.current);
    const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    const ink = token("--text-muted", "#586b63"), rule = token("--surface-border", "#d7dfdb");
    // A hairline at the hovered time, behind the lines, so the reader aims at a moment.
    const crosshair: Plugin<"line"> = {
      id: "onePagerCrosshair",
      beforeDatasetsDraw(chart) {
        const active = chart.tooltip?.getActiveElements() || [];
        if (!active.length) return;
        const { ctx, chartArea } = chart, x = active[0].element.x;
        ctx.save(); ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom);
        ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.stroke(); ctx.restore();
      },
    };
    const chart = new Chart(canvas.current, {
      type: "line",
      plugins: [crosshair],
      data: {
        datasets: SERIES.map(series => ({
          label: series.label, data: points.map(point => ({ x: point.at, y: point[series.field] })),
          borderColor: series.color, backgroundColor: series.color, borderWidth: 2, stepped: true,
          pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12, pointHoverBorderWidth: 2, pointHoverBorderColor: "#fff", fill: false,
        })),
      },
      options: {
        maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            usePointStyle: true,
            callbacks: {
              title: items => items.length ? `${moment.format(items[0].parsed.x ?? start)} Pacific` : "",
              label: item => ` ${item.formattedValue}  ${item.dataset.label}`,
              labelPointStyle: () => ({ pointStyle: "line", rotation: 0 }),
            },
          },
        },
        scales: {
          x: {
            type: "linear", min: start, max: end, border: { display: false }, grid: { display: false },
            afterBuildTicks: scale => { scale.ticks = ticks.values.map(value => ({ value })); },
            ticks: { color: ink, maxRotation: 0, autoSkip: true, callback: value => ticks.label(Number(value)) },
          },
          y: {
            beginAtZero: true, suggestedMax: latest.sent + Math.max(1, Math.round(latest.sent * 0.06)), border: { display: false }, grid: { color: rule },
            ticks: { color: ink, precision: 0 }, title: { display: true, text: "Reports", color: ink },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [points, ticks, start, end, latest.sent]);
  return <section className="one-pager-trend" aria-labelledby={id}>
    <h4 id={id}>Opens and clicks over time</h4>
    <p className="admin-note">Running count of reports with a first open or click, against the number sent so far. Times are Pacific.</p>
    <ul className="one-pager-legend" aria-label="Chart lines and current counts">
      {SERIES.map(series => <li key={series.field}><i aria-hidden="true" style={{ background: series.color }} />{series.label}<strong>{latest[series.field]}</strong></li>)}
    </ul>
    <div className="one-pager-chart"><canvas ref={canvas} aria-hidden="true" /></div>
    <details className="one-pager-chart-data"><summary>View chart data</summary>
      <table className="directory-player-table one-pager-table">
        <caption className="one-pager-sr-only">Running counts at each recorded change, Pacific time</caption>
        <thead><tr><th scope="col">Time</th>{SERIES.map(series => <th scope="col" key={series.field}>{series.label}</th>)}</tr></thead>
        <tbody>{points.map(point => <tr key={point.at}>
          <td data-label="Time"><time dateTime={new Date(point.at).toISOString()}>{moment.format(point.at)}</time></td>
          {SERIES.map(series => <td data-label={series.label} key={series.field}>{point[series.field]}</td>)}
        </tr>)}</tbody>
      </table>
    </details>
  </section>;
}
