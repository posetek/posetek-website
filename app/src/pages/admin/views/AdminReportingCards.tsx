import type { AdminReportingMetrics } from '../lib/adminReportingMetrics';

const CARDS = [
  ['testedPlayers', 'Players tested', '4+ different drills recorded'],
  ['claimedAccounts', 'Accounts claimed', 'Players who claimed their account'],
  ['iosDownloads', 'iOS downloads', 'Players with recorded iOS use'],
  ['repeatUsers', 'Repeat users', 'Active on 2+ days in the shown week'],
  ['weeklyUsers', 'Weekly users', 'Distinct players active in the shown week'],
  ['platformMinutes', 'Time on platform', 'Total estimated website + iOS use to date'],
] as const;
const finite = (value: number | null | undefined) => value != null && Number.isFinite(value) && value >= 0 ? value : null;
const format = (value: number | null | undefined, minutes = false) => value == null || !Number.isFinite(value) ? '—' : `${value.toLocaleString('en-US', { maximumFractionDigits: minutes ? 1 : 0 })}${minutes ? ' min' : ''}`;

export default function AdminReportingCards({ metrics }: { metrics?: AdminReportingMetrics }) {
  return <section aria-label="Participation and usage summary"><dl className="activity-summary activity-summary-six">
    {CARDS.map(([key, title, description]) => {
      const metric = metrics?.cards[key], minutes = key === 'platformMinutes';
      const value = metric?.status === 'unavailable' ? null : finite(metric?.value);
      const previous = metric?.status === 'unavailable' ? null : finite(metric?.previousValue);
      // Partial collection can change between snapshots; it cannot support a clean trend.
      const delta = metric?.status === 'available' && value != null && previous != null ? value - previous : null;
      const direction = delta == null || delta === 0 ? 'neutral' : delta > 0 ? 'up' : 'down';
      return <div key={key} className="activity-stat activity-card" title={metric?.note || 'Updated reporting data is unavailable.'}>
        <dt>{title}</dt><dd className={`activity-stat-value is-${direction}`}>{format(value, minutes)}</dd>
        <dd className="activity-stat-comparison"><span>Last week <strong>{format(previous, minutes)}</strong></span>{delta != null && <span className={`activity-stat-delta is-${direction}`} aria-label={`${delta > 0 ? 'Increase' : delta < 0 ? 'Decrease' : 'No change'} ${format(Math.abs(delta), minutes)}`}>{delta > 0 ? '↑' : delta < 0 ? '↓' : '–'} {format(Math.abs(delta), minutes)}</span>}</dd>
        <dd className="activity-stat-note">{value == null ? metric?.note || 'Updated reporting unavailable' : metric?.status === 'partial' ? `Partial coverage · ${description}` : description}</dd>
      </div>;
    })}
  </dl><details className="activity-card-definitions"><summary>Metric definitions</summary>
    {metrics && <p>Weekly activity: {metrics.windows.current.startDate}–{metrics.windows.current.endDate}. Comparison: {metrics.windows.previous.startDate}–{metrics.windows.previous.endDate}, the same weekdays last week. Players tested, accounts claimed, observed iOS users and time on platform are cumulative through each cutoff. Partial coverage does not support a week-to-week trend.</p>}
    <p>Repeat users counts players with recorded website or iOS use on at least two distinct local days in each shown week. Multiple visits on one day count as one active day.</p>
    <p>iOS downloads uses observed iOS activity as a proxy; it is not an App Store installation count. Estimated active time counts simultaneous website and iOS use once.</p>
    {CARDS.map(([key, title]) => metrics?.cards[key]?.note && <p key={key}><strong>{title}:</strong> {metrics.cards[key].note}</p>)}
  </details></section>;
}
