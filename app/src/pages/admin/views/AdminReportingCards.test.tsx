import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdminMetricValue, AdminReportingMetrics } from '../lib/adminReportingMetrics';
import AdminReportingCards from './AdminReportingCards';

const value = (current: number | null, previous: number | null, status: AdminMetricValue['status'] = 'available', note = ''): AdminMetricValue => ({ value: current, previousValue: previous, status, note });
function fixture(): AdminReportingMetrics {
  return {
    version: 1,
    windows: { current: { startDate: '2026-11-02', endDate: '2026-11-05' }, previous: { startDate: '2026-10-26', endDate: '2026-10-29' } },
    cards: { testedPlayers: value(20, 15), claimedAccounts: value(18, 18), iosDownloads: value(12, 10), repeatUsers: value(null, null, 'unavailable', 'Separate visits are not collected.'), weeklyUsers: value(6, 9), platformMinutes: value(132.5, 121.2) },
  };
}
const render = (metrics?: AdminReportingMetrics) => renderToStaticMarkup(<AdminReportingCards metrics={metrics} />);
const card = (html: string, title: string) => html.split(`<dt>${title}</dt>`)[1].split('</div>')[0];

describe('participation and usage cards', () => {
  it('shows six cohort metrics with independent matching-week comparisons', () => {
    const html = render(fixture());
    expect(html.match(/<dt>/g)).toHaveLength(6);
    expect(card(html, 'Players tested')).toContain('is-up">20');
    expect(card(html, 'Players tested')).toContain('aria-label="Increase 5"');
    expect(card(html, 'Weekly users')).toContain('is-down">6');
    expect(card(html, 'Weekly users')).toContain('aria-label="Decrease 3"');
    expect(card(html, 'Accounts claimed')).toContain('aria-label="No change 0"');
    expect(card(html, 'Time on platform')).toContain('132.5 min');
    expect(card(html, 'Time on platform')).toContain('aria-label="Increase 11.3 min"');
    expect(html).toContain('2026-11-02–2026-11-05');
    expect(html).toContain('2026-10-26–2026-10-29');
    expect(html).toContain('same weekdays last week');
    expect(html).toContain('not an App Store installation count');
  });
  it('preserves known zero and refuses to infer unsupported visits or a trend without prior evidence', () => {
    const metrics = fixture();
    metrics.cards.testedPlayers = value(0, 0);
    metrics.cards.claimedAccounts = value(18, null, 'available', 'Historical claim dates unavailable.');
    const html = render(metrics);
    expect(card(html, 'Players tested')).toContain('is-neutral">0');
    expect(card(html, 'Players tested')).toContain('No change 0');
    expect(card(html, 'Accounts claimed')).toContain('Last week <strong>—</strong>');
    expect(card(html, 'Accounts claimed')).not.toContain('activity-stat-delta');
    expect(card(html, 'Repeat users')).toContain('is-neutral">—');
    expect(card(html, 'Repeat users')).toContain('Separate visits are not collected.');
    expect(card(html, 'Repeat users')).not.toContain('activity-stat-delta');
  });
  it('makes partial coverage visible and does not compare snapshots with incomplete coverage', () => {
    const metrics = fixture();
    metrics.cards.iosDownloads = value(12, 10, 'partial', 'Only retained iOS activity is available.');
    const report = render(metrics), html = card(report, 'iOS downloads');
    expect(html).toContain('is-neutral">12');
    expect(html).toContain('Partial coverage · Players with recorded iOS use');
    expect(html).not.toContain('Only retained iOS activity is available.');
    expect(report).toContain('title="Only retained iOS activity is available."');
    expect(report).toContain('<strong>iOS downloads:</strong> Only retained iOS activity is available.');
    expect(html).not.toContain('activity-stat-delta');
  });
  it('treats unavailable or invalid measurements as missing rather than positive or zero evidence', () => {
    const metrics = fixture();
    metrics.cards.testedPlayers = value(20, 10, 'unavailable', 'Unavailable for this report.');
    metrics.cards.claimedAccounts = value(Number.NaN, 2);
    metrics.cards.iosDownloads = value(10, Number.POSITIVE_INFINITY);
    metrics.cards.weeklyUsers = value(-1, 2);
    const html = render(metrics);
    for (const title of ['Players tested', 'Accounts claimed', 'Weekly users']) expect(card(html, title)).toContain('is-neutral">—');
    expect(card(html, 'iOS downloads')).toContain('Last week <strong>—</strong>');
    for (const title of ['Players tested', 'Accounts claimed', 'iOS downloads', 'Weekly users']) expect(card(html, title)).not.toContain('activity-stat-delta');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('keeps all six metrics explicitly unavailable for an older report', () => {
    const html = render();
    expect(html.match(/<dt>/g)).toHaveLength(6);
    expect(html.match(/is-neutral">—/g)).toHaveLength(6);
    expect(html).not.toContain('activity-stat-delta');
    expect(html).not.toContain('Weekly activity:');
  });
});
