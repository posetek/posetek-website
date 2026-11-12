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
    expect(card(html, 'Time on platform')).toContain('Total estimated website + iOS use to date');
    expect(html).toContain('observed iOS users and time on platform are cumulative through each cutoff');
    expect(html).toContain('2026-11-02–2026-11-05');
    expect(html).toContain('2026-10-26–2026-10-29');
    expect(html).toContain('same weekdays last week');
    expect(html).toContain('not an App Store installation count');
  });
  it('shows the whole previous week and no change arrow for a part week', () => {
    const metrics = fixture();
    metrics.windows = { current: { startDate: '2026-11-09', endDate: '2026-11-09' }, previous: { startDate: '2026-11-02', endDate: '2026-11-08' },
      cumulative: { endDate: '2026-11-09', previousEndDate: '2026-11-08' } };
    metrics.cards.weeklyUsers = value(2, 40); metrics.cards.repeatUsers = value(0, 12); metrics.cards.platformMinutes = value(1250.5, 1248.7);
    const html = render(metrics);
    for (const [title, previous] of [['Weekly users', '40'], ['Repeat users', '12']]) {
      expect(card(html, title)).toContain(`Last week <strong>${previous}</strong>`);
      expect(card(html, title)).toContain('Week to date');
      expect(card(html, title)).not.toContain('activity-stat-delta');
      expect(card(html, title)).toContain('is-neutral">');
    }
    // Cumulative cards compare with the total at the end of last week and keep their arrow:
    // the difference is what the report week has added.
    expect(card(html, 'Players tested')).toContain('aria-label="Increase 5"');
    expect(card(html, 'Players tested')).not.toContain('Week to date');
    expect(card(html, 'Time on platform')).toContain('is-up">1,250.5 min');
    expect(card(html, 'Time on platform')).toContain('Last week <strong>1,248.7 min</strong>');
    expect(card(html, 'Time on platform')).toContain('aria-label="Increase 1.8 min"');
    expect(card(html, 'Time on platform')).not.toContain('Week to date');
    expect(card(html, 'Time on platform')).toContain('Total estimated website + iOS use to date');
    expect(html).toContain('Report week: 2026-11-09–2026-11-09, a part week. Last week: 2026-11-02–2026-11-08, the whole Monday–Sunday week before it.');
    expect(html).toContain('Repeat users and weekly users use these two weeks; a part week is shown as week to date, without a change arrow.');
    expect(html).toContain('Players tested, accounts claimed, observed iOS users and time on platform are cumulative, compared with the total through 2026-11-08');
    expect(html).not.toContain('same weekdays last week');
  });
  it('compares two complete weeks once the current week has ended', () => {
    const metrics = fixture();
    metrics.windows = { current: { startDate: '2026-11-02', endDate: '2026-11-08' }, previous: { startDate: '2026-10-26', endDate: '2026-11-01' } };
    const html = render(metrics);
    expect(card(html, 'Weekly users')).toContain('aria-label="Decrease 3"');
    expect(card(html, 'Weekly users')).not.toContain('Week to date');
    expect(html).toContain('Report week: 2026-11-02–2026-11-08. Last week: 2026-10-26–2026-11-01');
    expect(html).toContain('cumulative through each cutoff');
  });
  it('keeps a part week honest when coverage is partial or a value is missing', () => {
    const metrics = fixture();
    metrics.windows = { current: { startDate: '2026-10-19', endDate: '2026-10-21' }, previous: { startDate: '2026-10-12', endDate: '2026-10-18' } };
    metrics.cards.weeklyUsers = value(2, 40, 'partial'); metrics.cards.repeatUsers = value(null, 12);
    const html = render(metrics);
    expect(card(html, 'Weekly users')).toContain('Week to date'); expect(card(html, 'Weekly users')).toContain('Partial coverage');
    expect(card(html, 'Weekly users')).not.toContain('activity-stat-delta');
    // No current value: nothing to label as a week to date.
    expect(card(html, 'Repeat users')).not.toContain('Week to date'); expect(card(html, 'Repeat users')).toContain('Last week <strong>12</strong>');
    // A report ending on a past Wednesday is a part week, never "in progress".
    expect(html).toContain('Report week: 2026-10-19–2026-10-21, a part week.'); expect(html).not.toMatch(/in progress|so far/);
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
