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
  it('omits the email row when there is no signed-in email (the preview)', () => {
    const plain = text(renderToStaticMarkup(<AccountSettings ctx={ctx('preview')} email={null} onClose={() => {}} />));
    expect(plain).not.toContain('@');
    expect(plain).toContain('AI sharing');
  });
});
