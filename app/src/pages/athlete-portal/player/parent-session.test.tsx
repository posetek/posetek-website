import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PortalContext } from '../views/shared';
import AccountSettings from './account/AccountSettings';
import { deletionDetail, deletionTitle, parentDeletionEnabled, PARENT_DELETION_LIVE } from './account/account-deletion';
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
  it("offers a parent its delete actions exactly when the parent deletion switch is on", () => {
    // Reads the switch: turning PARENT_DELETION_LIVE on later needs no edit here.
    const on = parentDeletionEnabled();
    const html = renderToStaticMarkup(<AccountSettings ctx={{ ...base, guardian: true, guardianPlayerIds: ['child-a', 'child-b'] }} onClose={noop} email="parent@example.test" />);
    for (const label of ["Delete Avery&#x27;s data", "Delete this player&#x27;s data", 'Delete parent account']) expect(html.includes(label)).toBe(on);
    expect(html).not.toContain('/support#delete-account');
  });
  it("hides both parent delete actions in a production build, with nothing in their place", () => {
    const production = parentDeletionEnabled({ mode: 'production', dev: false });
    expect(production).toBe(PARENT_DELETION_LIVE);
    const html = renderToStaticMarkup(<AccountSettings ctx={{ ...base, guardian: true, guardianPlayerIds: ['child-a', 'child-b'] }} onClose={noop} email="parent@example.test" parentDeletion={production} />);
    if (!PARENT_DELETION_LIVE) {
      expect(html).not.toContain('Delete');
      expect(html).not.toContain('account-delete');
      expect(html).not.toContain('/support#delete-account');
      expect(html).toContain('AI sharing'); expect(html).toContain('Privacy policy');
    }
    // Only the local emulator development mode may show them early; never a production bundle.
    expect(parentDeletionEnabled({ mode: 'posetek-emulator-e2e', dev: true })).toBe(true);
    expect(parentDeletionEnabled({ mode: 'posetek-emulator-e2e', dev: false })).toBe(PARENT_DELETION_LIVE);
  });
  it("names each parent delete action when they are offered", () => {
    const html = renderToStaticMarkup(<AccountSettings ctx={{ ...base, guardian: true, guardianPlayerIds: ['child-a', 'child-b'] }} onClose={noop} email="parent@example.test" parentDeletion />);
    expect(html).toContain("Delete Avery&#x27;s data");
    expect(html).toContain("Delete this player&#x27;s data");
    expect(html).toContain('Delete parent account');
    expect(html).not.toContain('/support#delete-account');
    expect(deletionTitle({ kind: 'player', playerId: 'child-a', name: 'Avery' })).toBe("Delete Avery's data");
    expect(deletionDetail({ kind: 'player', playerId: 'child-a', name: 'Avery' })).toMatch(/Avery's profile, recordings, results.*Your parent account stays/);
    // What the server now deletes for a parent account: the account, its links and its AI conversations.
    expect(deletionDetail({ kind: 'self' })).toBe("Deletes your parent account, its links to your players and the AI conversations this sign-in created. Your players' profiles, recordings and training history stay. This cannot be undone.");
  });
  it('keeps the existing support link for a player, coach and admin whatever the parent switch says', () => {
    for (const parentDeletion of [false, true]) for (const access of ['athlete', 'coach', 'admin'] as const) {
      const html = renderToStaticMarkup(<AccountSettings ctx={{ ...base, access }} onClose={noop} email="someone@example.test" parentDeletion={parentDeletion} />);
      expect(html).toContain('/support#delete-account');
      expect(html).not.toContain('Delete parent account');
    }
  });
});
