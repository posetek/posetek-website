import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const outcome = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/firebase', () => ({ default: {}, auth: { currentUser: { uid: 'auth-player', getIdToken: async () => 'test-token' } }, db: {}, cloud: {}, storage: {} }));
vi.mock('./stats/use-stats-journey', () => ({ reportStatsJourneyOutcome: outcome }));
import { streamCoach } from './gateway';

const sse = (...frames: [string, object][]) => frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
const reply = (body: string, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
const send = (body: Record<string, unknown>) => streamCoach({ playerId: 'player-doc', message: 'Hi', ...body }, new AbortController().signal, () => {});

// The Stats page journey's "messaged the coach" follow-through, credited from the shared transport so
// the Coach tab component itself is unchanged.
describe('Stats page journey: the coach follow-through', () => {
  beforeEach(() => outcome.mockClear());
  afterEach(() => { vi.unstubAllGlobals(); });

  it('counts once, when a Coach-tab message is being answered', async () => {
    reply(sse(['start', { conversationId: 'c1' }], ['delta', { text: 'Hello' }], ['delta', { text: ' there' }], ['done', { messageId: 'm' }]));
    await send({ capability: 'pose_chat', context: { coachWorkspaceVersion: 1 } });
    expect(outcome.mock.calls).toEqual([['coach', 'player-doc']]);
  });

  it('does not count a start with nothing after it, a refusal, or a memory command', async () => {
    reply(sse(['start', { conversationId: 'c1' }]));
    await expect(send({ capability: 'pose_chat' })).rejects.toThrow();
    reply(sse(['start', { conversationId: 'c1' }], ['error', { code: 'daily_limit', message: 'Come back tomorrow.' }]));
    await expect(send({ capability: 'pose_chat' })).rejects.toThrow();
    reply(JSON.stringify({ error: { code: 'ai_sharing_off', message: 'Turn on AI sharing.' } }), 403);
    await expect(send({ capability: 'pose_chat' })).rejects.toThrow();
    reply(sse(['start', {}], ['memory', { workspace: { revision: 2 } }], ['done', {}]));
    await send({ capability: 'pose_chat', context: { coachWorkspaceVersion: 1, memoryAction: { kind: 'list' } } });
    expect(outcome).not.toHaveBeenCalled();
  });

  it('does not count the workout builder or the drill chat', async () => {
    for (const capability of ['workout_chat', 'coaching_chat']) {
      reply(sse(['start', {}], ['delta', { text: 'Sure' }], ['done', {}]));
      await send({ capability });
    }
    expect(outcome).not.toHaveBeenCalled();
  });
});
