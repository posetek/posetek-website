import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdminMetricValue, AdminReportingMetrics } from '../lib/adminReportingMetrics';
import AdminReportingCards from './AdminReportingCards';

const value = (current: number | null, previous: number | null, status: AdminMetricValue['status'] = 'available', note = ''): AdminMetricValue => ({ value: current, previousValue: previous, status, note });
function fixture(): AdminReportingMetrics {
  return {
    version: 1,
    windows: { current: { startDate: '2026-11-02', endDate: '2026-11-05' }, previous: { startDate: '2026-10-26', endDate: '2026-10-29' } },
    cards: { testedPlayers: value(20, 15), claimedAccounts: value(18, 18), iosDownloads: value(12, 10), repeatUsers: value(4, 3), weeklyUsers: value(6, 9), platformMinutes: value(132.5, 121.2) },
  };
}
const render = (metrics?: AdminReportingMetrics) => renderToStaticMarkup(<AdminReportingCards metrics={metrics} />);
const card = (html: string, title: string) => html.split(`<dt>${title}</dt>`)[1].split('</div>')[0];

describe('participation and usage cards', () => {
  it('shows six cohort metrics with matching-weekday comparisons from an earlier reporting service', () => {
    const html = render(fixture());
    expect(html.match(/<dt>/g)).toHaveLength(6);
    expect(card(html, 'Players tested')).toContain('is-up">20');
    expect(card(html, 'Players tested')).toContain('aria-label="Increase 5"');
    expect(card(html, 'Weekly users')).toContain('is-down">6');
    expect(card(html, 'Weekly users')).toContain('aria-label="Decrease 3"');
    expect(card(html, 'Accounts claimed')).toContain('aria-label="No change 0"');
    expect(card(html, 'Repeat users')).toContain('is-up">4');
    expect(card(html, 'Repeat users')).toContain('Last week <strong>3</strong>');
    expect(card(html, 'Repeat users')).toContain('Active on 2+ days in the shown week');
    expect(html).toContain('Multiple visits on one day count as one active day.');
    expect(card(html, 'Time on platform')).toContain('132.5 min');
    expect(card(html, 'Time on platform')).toContain('aria-label="Increase 11.3 min"');
    expect(html).toContain('2026-11-02–2026-11-05');
    expect(html).toContain('2026-10-26–2026-10-29');
    expect(html).toContain('same weekdays last week');
    expect(html).toContain('not an App Store installation count');
  });
  it('shows the whole previous week and no change arrow while the current week is in progress', () => {
    const metrics = fixture();
    metrics.windows = { current: { startDate: '2026-11-09', endDate: '2026-11-09' }, previous: { startDate: '2026-11-02', endDate: '2026-11-08' },
      cumulative: { endDate: '2026-11-09', previousEndDate: '2026-11-02' } };
    metrics.cards.weeklyUsers = value(2, 40); metrics.cards.repeatUsers = value(0, 12); metrics.cards.platformMinutes = value(1.8, 312.4);
    const html = render(metrics);
    for (const [title, previous] of [['Weekly users', '40'], ['Repeat users', '12'], ['Time on platform', '312.4 min']]) {
      expect(card(html, title)).toContain(`Last week <strong>${previous}</strong>`);
      expect(card(html, title)).toContain('This week so far');
      expect(card(html, title)).not.toContain('activity-stat-delta');
      expect(card(html, title)).toContain('is-neutral">');
    }
    // Cumulative cards keep their seven-day comparison and its arrow.
    expect(card(html, 'Players tested')).toContain('aria-label="Increase 5"');
    expect(card(html, 'Players tested')).not.toContain('This week so far');
    expect(html).toContain('This week: 2026-11-09–2026-11-09, still in progress. Last week: 2026-11-02–2026-11-08, the whole Monday–Sunday week.');
    expect(html).toContain('compared with the total through 2026-11-02');
    expect(html).not.toContain('same weekdays last week');
  });
  it('compares two complete weeks once the current week has ended', () => {
    const metrics = fixture();
    metrics.windows = { current: { startDate: '2026-11-02', endDate: '2026-11-08' }, previous: { startDate: '2026-10-26', endDate: '2026-11-01' } };
    const html = render(metrics);
    expect(card(html, 'Weekly users')).toContain('aria-label="Decrease 3"');
    expect(card(html, 'Weekly users')).not.toContain('This week so far');
    expect(html).toContain('This week: 2026-11-02–2026-11-08. Last week: 2026-10-26–2026-11-01');
    expect(html).toContain('cumulative through each cutoff');
  });
  it('preserves known zero and refuses to infer activity or a trend without collection evidence', () => {
    const metrics = fixture();
    metrics.cards.testedPlayers = value(0, 0);
    metrics.cards.repeatUsers = value(null, null, 'unavailable', 'Usage collection unavailable.');
    metrics.cards.claimedAccounts = value(18, null, 'available', 'Historical claim dates unavailable.');
    const html = render(metrics);
    expect(card(html, 'Players tested')).toContain('is-neutral">0');
    expect(card(html, 'Players tested')).toContain('No change 0');
    expect(card(html, 'Accounts claimed')).toContain('Last week <strong>—</strong>');
    expect(card(html, 'Accounts claimed')).not.toContain('activity-stat-delta');
    expect(card(html, 'Repeat users')).toContain('is-neutral">—');
    expect(card(html, 'Repeat users')).toContain('Usage collection unavailable.');
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
