import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PortalContext } from '../views/shared';
import AccountSettings from './account/AccountSettings';
import { deletionDetail, deletionTitle } from './account/account-deletion';
import { guardianMenu } from './guardian-session';
import { accountMenuItems } from './PlayerShell';

const base: PortalContext = { access: 'athlete', playerId: 'child-a', athlete: { firstName: 'Avery' }, notify: () => {}, allStatsReps: () => [] };
const noop = () => {};

describe('parent session in the player view', () => {
  it('adds Switch player only with more than one child, and Add player for every parent', () => {
    expect(guardianMenu(base)).toEqual({ canSwitch: false, canAdd: false });
    expect(guardianMenu({ guardian: true, guardianPlayerIds: ['child-a'] })).toEqual({ canSwitch: false, canAdd: true });
    expect(guardianMenu({ guardian: true, guardianPlayerIds: ['child-a', 'child-b', 'child-c'] })).toEqual({ canSwitch: true, canAdd: true });
  });
  it('lists the parent rows between Return to home and Sign out, and none for a player', () => {
    expect(accountMenuItems({ onAccountSettings: noop, onReturnHome: noop, onSignOut: noop }).map(item => item.label)).toEqual(['Account settings', 'Return to home', 'Sign out']);
    expect(accountMenuItems({ onAccountSettings: noop, onReturnHome: noop, onSwitchPlayer: noop, onAddPlayer: noop, onSignOut: noop }).map(item => item.label))
      .toEqual(['Account settings', 'Return to home', 'Switch player', 'Add player', 'Sign out']);
  });
  it("shows a parent one delete action per child and one for the parent account, each naming what it deletes", () => {
    const html = renderToStaticMarkup(<AccountSettings ctx={{ ...base, guardian: true, guardianPlayerIds: ['child-a', 'child-b'] }} onClose={noop} email="parent@example.test" />);
    expect(html).toContain("Delete Avery&#x27;s data");
    expect(html).toContain("Delete this player&#x27;s data");
    expect(html).toContain('Delete parent account');
    expect(html).not.toContain('/support#delete-account');
    expect(deletionTitle({ kind: 'player', playerId: 'child-a', name: 'Avery' })).toBe("Delete Avery's data");
    expect(deletionDetail({ kind: 'player', playerId: 'child-a', name: 'Avery' })).toMatch(/Avery's profile, recordings, results.*Your parent account stays/);
    expect(deletionDetail({ kind: 'self' })).toMatch(/parent account.*players' profiles and data stay/);
  });
  it('keeps the existing support link for a player', () => {
    const html = renderToStaticMarkup(<AccountSettings ctx={base} onClose={noop} email="player@example.test" />);
    expect(html).toContain('/support#delete-account');
    expect(html).not.toContain('Delete parent account');
  });
});
