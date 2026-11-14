import { afterEach, describe, expect, it, vi } from 'vitest';
import { actingPlayerId, actingPlayerScope, enterActingPlayer } from '../../../lib/acting-player';
import { createSocialApi } from '../../feed/api';
import { createWorkoutActivity } from './workout-activity';
import { actsForPlayer } from './player-age';
import { weekTitle } from './home/recent-training';

let leave: (() => void) | undefined;
afterEach(() => { leave?.(); leave = undefined; });

describe('the acting child of a parent session', () => {
  it('names the child only for the login that registered it, and ends with that registration', () => {
    expect(actingPlayerScope('parent', 'child-a')).toEqual({});
    leave = enterActingPlayer('parent', 'child-a');
    expect(actingPlayerScope('parent', 'child-a')).toEqual({ playerId: 'child-a' });
    expect(actingPlayerScope('parent', 'child-b')).toEqual({});
    expect(actingPlayerScope('someone-else', 'child-a')).toEqual({});
    const next = enterActingPlayer('parent', 'child-b');
    leave(); // ending an older registration never clears a newer one
    expect(actingPlayerId('parent')).toBe('child-b');
    next(); expect(actingPlayerId('parent')).toBeNull();
  });
});

describe('social endpoints are owner-only', () => {
  const transport = () => { const calls: [string, unknown][] = []; return { calls, httpsCallable: (name: string) => async (data: unknown) => { calls.push([name, data]); return { data: {} }; } }; };
  it('sends an owner request unchanged, with no acting child on any endpoint', async () => {
    const owner = transport();
    await createSocialApi(owner, () => false)('getSocialFeed', { scope: 'organization' });
    await createSocialApi(owner, () => false)('socialConnection', { playerId: 'teammate', action: 'request' });
    expect(owner.calls).toEqual([['getSocialFeed', { scope: 'organization' }], ['socialConnection', { playerId: 'teammate', action: 'request' }]]);
  });
  it('never calls a social endpoint in a parent session', async () => {
    const parent = transport(), api = createSocialApi(parent, () => true);
    await expect(api('getSocialContext', {})).rejects.toThrow();
    await expect(api('getSocialFeed', { scope: 'organization' })).rejects.toThrow();
    await expect(api('setSocialKudos', { id: 'activity', liked: true } as never)).rejects.toThrow();
    expect(parent.calls).toEqual([]);
  });
  it('treats a registered acting child as a parent session for the shared client', () => {
    leave = enterActingPlayer('parent', 'child-a');
    expect(actingPlayerId('parent')).not.toBeNull();
  });
});

describe('workout activity in a parent session', () => {
  it('names the child on every request only while the scope says so', async () => {
    const sent: Record<string, unknown>[] = [];
    let scope: { playerId?: string } = { playerId: 'child-a' };
    const activity = createWorkoutActivity({ uid: 'parent', playerId: 'child-a', source: 'workoutLogs', logId: 'log', sessionId: 'session',
      read: () => ({ uid: 'parent', playerId: 'child-a', currentOwner: true, visible: true, running: true, ended: false }),
      send: vi.fn(async request => { sent.push(request); return { accepted: true, ownerEpoch: 1 }; }), scope: () => scope });
    activity.resume(); await Promise.resolve(); await Promise.resolve();
    expect(sent[0]).toMatchObject({ type: 'resume', playerId: 'child-a' });
    scope = {}; activity.pause(); await Promise.resolve(); await Promise.resolve();
    expect(sent[1].type).toBe('pause'); expect('playerId' in sent[1]).toBe(false);
    activity.dispose();
  });
});

describe('player view checks that compare the signed-in login with the profile', () => {
  it('lets a listed parent record the child\'s age, as the owner can', () => {
    expect(actsForPlayer({ authenticationUID: 'child-login', guardianUIDs: ['parent'] }, 'child-a', 'parent')).toBe(true);
    expect(actsForPlayer({ authenticationUID: 'child-login', guardianUIDs: ['parent'] }, 'child-a', 'child-login')).toBe(true);
    expect(actsForPlayer({ guardianUIDs: ['parent'] }, 'child-a', 'parent')).toBe(true);
    expect(actsForPlayer({ authenticationUID: 'child-login', guardianUIDs: ['other'] }, 'child-a', 'parent')).toBe(false);
    expect(actsForPlayer({}, 'child-a', 'parent')).toBe(false);
  });
  it("titles a parent's week with the child's name, as the app does for non-players", () => {
    expect(weekTitle('athlete', 'Avery')).toBe('Your week');
    expect(weekTitle('athlete', 'Avery', true)).toBe('Avery’s week');
  });
});
