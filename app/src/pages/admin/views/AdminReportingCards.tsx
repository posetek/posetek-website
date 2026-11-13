import type { AdminReportingMetrics } from '../lib/adminReportingMetrics';

const CARDS = [
  ['testedPlayers', 'Players tested', '4+ different drills recorded'],
  ['claimedAccounts', 'Accounts claimed', 'Players who claimed their account'],
  ['iosDownloads', 'iOS downloads', 'Players with recorded iOS use'],
  ['repeatUsers', 'Repeat users', 'Active on 2+ days in the shown week'],
  ['weeklyUsers', 'Weekly users', 'Distinct players active in the shown week'],
  ['platformMinutes', 'Time on platform', 'Estimated active website + iOS use'],
] as const;
const finite = (value: number | null | undefined) => value != null && Number.isFinite(value) && value >= 0 ? value : null;
const WEEKLY = new Set<string>(['repeatUsers', 'weeklyUsers', 'platformMinutes']);
const days = (window: { startDate: string; endDate: string }) => Math.round((Date.parse(`${window.endDate}T12:00:00Z`) - Date.parse(`${window.startDate}T12:00:00Z`)) / 86_400_000) + 1;
const countFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const minutesFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export default function AdminReportingCards({ metrics }: { metrics?: AdminReportingMetrics }) {
  const windows = metrics?.windows;
  const wholePreviousWeek = Boolean(windows) && days(windows!.previous) === 7;
  const partWeek = Boolean(windows) && days(windows!.current) < days(windows!.previous);
  return <section aria-label="Participation and usage summary"><dl className="activity-summary activity-summary-six">
    {CARDS.map(([key, title, description]) => {
      const metric = metrics?.cards[key], minutes = key === 'platformMinutes';
      const value = metric?.status === 'unavailable' ? null : finite(metric?.value);
      const previous = metric?.status === 'unavailable' ? null : finite(metric?.previousValue);
      const formatter = minutes ? minutesFormat : countFormat;
      const currentText = value === null ? null : formatter.format(value);
      const previousText = previous === null ? null : formatter.format(previous);
      // Use the same rounded figures as the card, removing en-US digit grouping.
      const delta = currentText === null || previousText === null
        ? null : Number(currentText.replaceAll(',', '')) - Number(previousText.replaceAll(',', ''));
      const direction = delta == null || delta === 0 ? 'neutral' : delta > 0 ? 'up' : 'down';
      const withUnit = (text: string | null) => text === null ? '—' : `${text}${minutes ? ' min' : ''}`;
      const deltaText = delta === null ? null : withUnit(formatter.format(Math.abs(delta)));
      return <div key={key} className="activity-stat activity-card" title={metric?.note || 'Updated reporting data is unavailable.'}>
        <dt>{title}</dt><dd className={`activity-stat-value is-${direction}`}>{withUnit(currentText)}</dd>
        <dd className="activity-stat-comparison"><span>Last week <strong>{withUnit(previousText)}</strong></span>{delta != null && <span className={`activity-stat-delta is-${direction}`} aria-label={`${delta > 0 ? 'Increase' : delta < 0 ? 'Decrease' : 'No change'} ${deltaText}`}>{delta > 0 ? '↑' : delta < 0 ? '↓' : '–'} {deltaText}</span>}{partWeek && WEEKLY.has(key) && value != null && <span>Week to date</span>}</dd>
        <dd className="activity-stat-note">{value == null ? metric?.note || 'Updated reporting unavailable' : metric?.status === 'partial' ? `Partial coverage · ${description}` : description}</dd>
      </div>;
    })}
  </dl><details className="activity-card-definitions"><summary>Metric definitions</summary>
    {windows && <p>{wholePreviousWeek
      ? <>Report week: {windows.current.startDate}–{windows.current.endDate}{partWeek && ', a part week'}. Last week: {windows.previous.startDate}–{windows.previous.endDate}, the whole Monday–Sunday week before it. Repeat users, weekly users and time on platform use these two weeks. A part week is shown as week to date.</>
      : <>Weekly activity: {windows.current.startDate}–{windows.current.endDate}. Comparison: {windows.previous.startDate}–{windows.previous.endDate}, the same weekdays last week.</>} Players tested, accounts claimed and observed iOS users are cumulative{windows.cumulative ? <>, compared with the total through {windows.cumulative.previousEndDate}</> : ' through each cutoff'}. Arrows compare the displayed totals, including figures labeled Partial coverage or Week to date.</p>}
    <p>Repeat users counts players with recorded website or iOS use on at least two distinct local days in each shown week. Multiple visits on one day count as one active day.</p>
    <p>iOS downloads uses observed iOS activity as a proxy; it is not an App Store installation count. Estimated active time counts simultaneous website and iOS use once.</p>
    {CARDS.map(([key, title]) => metrics?.cards[key]?.note && <p key={key}><strong>{title}:</strong> {metrics.cards[key].note}</p>)}
  </details></section>;
}
