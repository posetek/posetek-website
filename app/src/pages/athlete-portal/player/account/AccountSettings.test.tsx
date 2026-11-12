import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AccountSettings from './AccountSettings';

const ctx = (access: 'athlete' | 'preview') => ({ access, playerId: 'p1', athlete: { firstName: 'Avery' }, notify: () => {}, allStatsReps: () => [] });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('Account settings sheet (AccountSettingsView)', () => {
  it('lists the signed-in account, AI sharing, deletion help, privacy and support in the app order', () => {
    const html = renderToStaticMarkup(<AccountSettings ctx={ctx('athlete')} email="avery@example.com" onClose={() => {}} />), plain = text(html);
    expect(html).toContain('role="dialog"'); expect(html).toContain('aria-modal="true"');
    const order = ['Done', 'Account settings', 'Your account', 'avery@example.com', 'Age', 'AI sharing', 'Delete account', 'Privacy policy', 'Support'];
    let at = -1;
    for (const item of order) { const next = plain.indexOf(item, at + 1); expect(next, item).toBeGreaterThan(at); at = next; }
    expect(html).toContain('href="/support#delete-account"'); expect(html).toContain('href="/privacy"'); expect(html).toContain('href="/support"');
    expect(plain).not.toContain('Share app usage');
  });
  it('renders every row with content and the age as one row, so no list starts or ends with a blank row', () => {
    for (const email of ['avery@example.com', null, '']) {
      const html = renderToStaticMarkup(<AccountSettings ctx={ctx('preview')} email={email} onClose={() => {}} />);
      // The first list opens directly on its first row, which is the email or else the age.
      const firstList = html.split('<div class="account-list">')[1];
      expect(firstList.startsWith(email ? '<p class="account-row">' : '<div class="account-row account-age">')).toBe(true);
      const rows = html.split(/<(?:p|div|button|a)(?: [a-z-]+="[^"]*")*? class="account-row/).slice(1).map(row => text(`<x ${row}`).replace(/^x\s*/, ''));
      expect(rows.length).toBe(email ? 6 : 5);
      for (const row of rows) expect(row.length).toBeGreaterThan(0);
      expect(rows[email ? 1 : 0]).toMatch(/^Age /);
      expect(html.match(/class="player-profile-age"/g)).toHaveLength(1);
    }
  });
  it('omits the email row when there is no signed-in email (the preview)', () => {
    const plain = text(renderToStaticMarkup(<AccountSettings ctx={ctx('preview')} email={null} onClose={() => {}} />));
    expect(plain).not.toContain('@');
    expect(plain).toContain('AI sharing');
  });
});
