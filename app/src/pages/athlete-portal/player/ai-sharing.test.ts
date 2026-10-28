import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ user: null as any, storage: new Map<string, string>(), fetch: vi.fn() }));
vi.mock('../../../lib/firebase', () => ({ auth: { get currentUser() { return harness.user; } } }));
import { assertAISharingEnabled, setAISharing } from './ai-sharing';
import { streamCoach } from './gateway';

let account = 0;
beforeEach(() => {
  harness.user = { uid: `synthetic-${++account}`, getIdToken: vi.fn().mockResolvedValue('synthetic-token') };
  harness.fetch.mockReset(); harness.storage.clear();
  vi.stubGlobal('fetch', harness.fetch);
  vi.stubGlobal('localStorage', { getItem: (key: string) => harness.storage.get(key) ?? null,
    setItem: (key: string, value: string) => harness.storage.set(key, value), removeItem: (key: string) => harness.storage.delete(key) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const reply = (allowed: boolean) => new Response(JSON.stringify({ version: 1, allowed }));

describe('explicit account-scoped AI sharing', () => {
  it('sends only the explicit choice to the fixed endpoint and accepts an exact receipt', async () => {
    harness.fetch.mockResolvedValue(reply(true));
    await setAISharing(true);
    expect(harness.fetch).toHaveBeenCalledWith('/api/ai-consent', expect.objectContaining({ method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' }, body: '{"version":1,"allowed":true}' }));
    expect(harness.storage.size).toBe(0);
  });
  it('fails closed on HTML fallback, malformed acknowledgement and server refusal', async () => {
    for (const response of [new Response('<html>App</html>'), new Response('{"allowed":true}'),
      new Response('{"error":{"code":"unauthenticated","message":"Sign in again"}}', { status: 401 })]) {
      harness.fetch.mockResolvedValueOnce(response);
      await expect(setAISharing(true)).rejects.toThrow();
    }
  });
  it('keeps new coach calls off after failed withdrawal until an allow is acknowledged', async () => {
    harness.fetch.mockRejectedValueOnce(new TypeError('Offline'));
    await expect(setAISharing(false)).rejects.toThrow('Account-wide withdrawal could not be confirmed');
    await expect(streamCoach({ message: 'Make a workout' }, new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'ai_consent_required' });
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    harness.fetch.mockResolvedValueOnce(reply(true)); await setAISharing(true);
    expect(() => assertAISharingEnabled(harness.user.uid)).not.toThrow();
  });
  it('keeps withdrawal blocked when storage writes fail but reads still work', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); }, removeItem: () => {} });
    harness.fetch.mockRejectedValueOnce(new TypeError('Offline'));
    await expect(setAISharing(false)).rejects.toThrow('Account-wide withdrawal could not be confirmed');
    expect(() => assertAISharingEnabled(harness.user.uid)).toThrow('AI sharing is off');
  });
  it('serializes choices across controls so an old allowance cannot undo a newer withdrawal', async () => {
    let resolve!: (response: Response) => void;
    harness.fetch.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    const oldAllow = expect(setAISharing(true)).rejects.toThrow('choice changed');
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledTimes(1));
    harness.fetch.mockRejectedValueOnce(new TypeError('Offline'));
    const withdrawal = expect(setAISharing(false)).rejects.toThrow('Account-wide withdrawal could not be confirmed');
    expect(() => assertAISharingEnabled(harness.user.uid)).toThrow('AI sharing is off');
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    resolve(reply(true)); await oldAllow; await withdrawal;
    expect(harness.fetch).toHaveBeenCalledTimes(2);
    expect(() => assertAISharingEnabled(harness.user.uid)).toThrow('AI sharing is off');
  });
  it('does not send an old account token after an account change during token refresh', async () => {
    let resolve!: (token: string) => void;
    harness.user.getIdToken.mockReturnValue(new Promise<string>(done => { resolve = done; }));
    const pending = setAISharing(true);
    harness.user = { uid: 'different-account' }; resolve('old-token');
    await expect(pending).rejects.toThrow('account changed'); expect(harness.fetch).not.toHaveBeenCalled();
  });
  it('does not acknowledge a late reply to a different account', async () => {
    let resolve!: (response: Response) => void;
    harness.fetch.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    const pending = setAISharing(true); await Promise.resolve();
    harness.user = { uid: 'new-account' }; resolve(reply(true));
    await expect(pending).rejects.toThrow('account changed');
  });
  it('bounds token refresh and prevents late timed-out tokens from sending a choice', async () => {
    vi.useFakeTimers(); let resolve!: (token: string) => void;
    harness.user.getIdToken.mockReturnValue(new Promise<string>(done => { resolve = done; }));
    const pending = expect(setAISharing(true)).rejects.toThrow('could not be confirmed');
    await vi.advanceTimersByTimeAsync(20_000); await pending;
    resolve('late-token'); await Promise.resolve(); expect(harness.fetch).not.toHaveBeenCalled();
  });
  it('preserves the consent error code from HTTP and SSE so the UI can recover', async () => {
    harness.fetch.mockResolvedValueOnce(new Response('{"error":{"code":"ai_consent_required","message":"Review AI sharing"}}', { status: 403 }));
    await expect(streamCoach({}, new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'ai_consent_required' });
    harness.fetch.mockResolvedValueOnce(new Response('event: error\ndata: {"code":"ai_consent_required","message":"Review AI sharing"}\n\n'));
    await expect(streamCoach({}, new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'ai_consent_required' });
  });
});


describe('coach-memory privacy actions after AI-sharing withdrawal', () => {
  const request = (memoryAction: Record<string, unknown>, context: Record<string, unknown> = {}) => ({
    capability: 'pose_chat', playerId: 'player-doc', message: '', context: { coachWorkspaceVersion: 1, memoryAction, ...context },
  });
  async function withdraw() {
    harness.fetch.mockRejectedValueOnce(new TypeError('Offline'));
    await expect(setAISharing(false)).rejects.toThrow('Account-wide withdrawal could not be confirmed');
    harness.fetch.mockClear();
  }

  it.each([
    { kind: 'list' }, { kind: 'forget', memoryId: 'memory-1', expectedRevision: 3 },
    { kind: 'forgetAll', expectedRevision: 3 }, { kind: 'setEnabled', enabled: false, expectedRevision: 3 },
  ])('allows only the existing deterministic privacy command $kind without changing sharing', async action => {
    await withdraw(); harness.fetch.mockResolvedValueOnce(new Response('event: memory\ndata: {"workspace":{"revision":4},"memories":[]}\n\nevent: done\ndata: {}\n\n'));
    await expect(streamCoach(request(action), new AbortController().signal, () => {})).resolves.toBeUndefined();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(() => assertAISharingEnabled(harness.user.uid)).toThrow('AI sharing is off');
  });

  it.each([
    request({ kind: 'confirm', memoryId: 'memory-1', expectedRevision: 3 }),
    request({ kind: 'setEnabled', enabled: true, expectedRevision: 3 }),
    request({ kind: 'setEnabled', enabled: 0, expectedRevision: 3 }),
    request({ kind: 'forget', memoryId: '../other', expectedRevision: 3 }),
    request({ kind: 'forget', memoryId: 'memory-1', expectedRevision: true }),
    request({ kind: 'forgetAll', expectedRevision: -1 }),
    request({ kind: 'forgetAll', expectedRevision: 1.5 }),
    request({ kind: 'list', extra: 'not-privacy' }),
    request({ kind: 'list' }, { personalWorkoutFlowVersion: 1 }),
    request({ kind: 'list' }, { coachWorkspaceVersion: '1' }),
    { ...request({ kind: 'list' }), capability: 'coaching_chat' },
    { capability: 'pose_chat', message: 'Remember this' },
  ])('keeps generation, confirmation, enabling and malformed/combined requests blocked', async body => {
    await withdraw();
    await expect(streamCoach(body, new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'ai_consent_required' });
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it('preserves server refusal of a privacy action', async () => {
    await withdraw(); harness.fetch.mockResolvedValueOnce(new Response('{"code":"permission_denied","message":"Only the athlete can manage memory"}', { status: 403 }));
    await expect(streamCoach(request({ kind: 'list' }), new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'permission_denied' });
    expect(() => assertAISharingEnabled(harness.user.uid)).toThrow('AI sharing is off');
  });
});
