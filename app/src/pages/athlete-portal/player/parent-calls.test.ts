import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actingPlayerId, actingPlayerScope, enterActingPlayer } from '../../../lib/acting-player';
import { forgetParentSession, forgetParentSessions, isParentSession } from '../../../lib/parent-session';
import { createSocialApi, ParentSocialRefusal, socialParentSession } from '../../feed/api';
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
  // The shared client's real predicate, against a stand-in Firestore holding only guardians records.
  const guardiansDb = (records: Record<string, unknown>, denied = false) => ({ collection: () => ({
    doc: (id: string) => ({ get: async () => {
      if (denied) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      return { id, exists: id in records, data: () => records[id] };
    } }),
    where: () => { throw new Error('never queried'); },
  }) }) as never;
  beforeEach(forgetParentSessions);
  it('treats a login acting for a child, or any login with a guardians record, as a parent session', async () => {
    expect(await isParentSession(null)).toBe(false);
    leave = enterActingPlayer('parent', 'child-a');
    expect(await isParentSession('parent', guardiansDb({}))).toBe(true);
    leave(); leave = undefined;
    expect(await isParentSession('parent-on-feed', guardiansDb({ 'parent-on-feed': { userUID: 'parent-on-feed', playerIds: ['child-a'] } }))).toBe(true);
    expect(await isParentSession('player', guardiansDb({}))).toBe(false);
    expect(await isParentSession('before-rules', guardiansDb({}, true))).toBe(false);
  });
  it('falls back to "not a parent" after a short wait for a slow read, without keeping the fallback', async () => {
    let finish!: () => void;
    const slow = { collection: () => ({ doc: (id: string) => ({ get: () => new Promise(resolve => { finish = () => resolve({ id, exists: true, data: () => ({ userUID: id, playerIds: ['child-a'] }) }); }) }) }) } as never;
    const started = Date.now();
    expect(await isParentSession('slow-parent', slow, 20)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    finish(); await Promise.resolve(); await Promise.resolve();
    // The read itself completed and is kept: the next check knows.
    expect(await isParentSession('slow-parent', slow, 20)).toBe(true);
  });
  it('reads the record again after a redeem changed it', async () => {
    const records: Record<string, unknown> = {};
    const source = guardiansDb(records);
    expect(await isParentSession('new-parent', source)).toBe(false);
    records['new-parent'] = { userUID: 'new-parent', playerIds: ['child-a'] };
    expect(await isParentSession('new-parent', source)).toBe(false);
    forgetParentSession('new-parent');
    expect(await isParentSession('new-parent', source)).toBe(true);
  });
  it('refuses every social call through that predicate for a parent, and calls through for an owner', async () => {
    const parent = transport(), owner = transport();
    const records = { 'parent-on-feed': { userUID: 'parent-on-feed', playerIds: ['child-a'] } };
    await expect(createSocialApi(parent, () => isParentSession('parent-on-feed', guardiansDb(records)))('getSocialFeed', { scope: 'organization' })).rejects.toBeInstanceOf(ParentSocialRefusal);
    await createSocialApi(owner, () => isParentSession('player', guardiansDb(records)))('getSocialFeed', { scope: 'organization' });
    expect(parent.calls).toEqual([]); expect(owner.calls).toEqual([['getSocialFeed', { scope: 'organization' }]]);
    expect(typeof socialParentSession).toBe('function');
  });
});

describe('workout activity in a parent session', () => {
  const reporter = (scope: { playerId?: string }, sent: Record<string, unknown>[]) => createWorkoutActivity({ uid: 'parent', playerId: 'child-a', source: 'workoutLogs', logId: 'log', sessionId: 'session',
    read: () => ({ uid: 'parent', playerId: 'child-a', currentOwner: true, visible: true, running: true, ended: false }),
    send: vi.fn(async request => { sent.push(request); return { accepted: true, ownerEpoch: 1 }; }), scope });
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  it('names the child on every request, including the final pause after the child view has closed', async () => {
    const sent: Record<string, unknown>[] = [];
    leave = enterActingPlayer('parent', 'child-a');
    const activity = reporter(actingPlayerScope('parent', 'child-a'), sent);
    activity.resume(); await settle();
    // The child's view unmounts: its registration ends before the workout's close() runs.
    leave(); leave = undefined;
    activity.close(); await settle();
    expect(sent.map(request => [request.type, request.playerId])).toEqual([['resume', 'child-a'], ['pause', 'child-a']]);
  });
  it('sends an owner request without playerId', async () => {
    const sent: Record<string, unknown>[] = [];
    const activity = reporter({}, sent);
    activity.resume(); await settle(); activity.close(); await settle();
    expect(sent.every(request => !('playerId' in request))).toBe(true);
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
