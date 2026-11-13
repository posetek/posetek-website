import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ user: null as any, fetch: vi.fn() }));
vi.mock('../../../lib/firebase', () => ({ auth: { get currentUser() { return harness.user; } }, db: {} }));
import { streamCoach } from './gateway';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const encode = (value: string) => new TextEncoder().encode(value);
function response(chunks: Uint8Array[], cancel = vi.fn()) {
  return new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); }, cancel,
  }));
}
const done = 'event: done\ndata: {"finishReason":"stop"}\n\n';
const call = (onFrame = vi.fn(), signal = new AbortController().signal) => streamCoach({
  capability: 'pose_chat', playerId: 'player-doc', message: 'How did I do?', conversationId: 'conversation',
}, signal, onFrame);

beforeEach(() => {
  harness.user = { uid: 'actor-uid', getIdToken: vi.fn().mockResolvedValue('synthetic-token') };
  harness.fetch.mockReset(); vi.stubGlobal('fetch', harness.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('shared coach stream transport', () => {
  it('preserves the feature body and fixed proxy while adding matching correlation metadata', async () => {
    harness.fetch.mockResolvedValue(new Response(done));
    const context = { workoutRef: { kind: 'newYoga', minutes: 20 } };
    await streamCoach({ capability: 'workout_chat', playerId: 'p', message: 'Stretch', context }, new AbortController().signal, () => {});
    const [url, request] = harness.fetch.mock.calls[0], body = JSON.parse(request.body);
    expect(url).toBe('https://us-central1-kickai-69dd0.cloudfunctions.net/aiCoachStreamProxy');
    expect(body).toEqual({ schemaVersion: 1, clientVersion: '1.1+4', capability: 'workout_chat', playerId: 'p', message: 'Stretch', context, requestId: expect.any(String) });
    expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(request.headers).toMatchObject({ Authorization: 'Bearer synthetic-token', Accept: 'text/event-stream',
      'X-PoseTek-Request-Id': body.requestId, 'X-PoseTek-Client': 'web/athlete-portal' });
  });

  it('parses split UTF-8, CRLF boundaries, multiline JSON and heartbeat without requiring start', async () => {
    const wire = encode(': ping\r\n\r\nevent: delta\r\ndata: {\r\ndata: "text":"⚽ résumé"}\r\n\r\nevent: draft\r\ndata: {"draftId":"d"}\r\n\r\nevent: done\r\ndata: {}');
    harness.fetch.mockResolvedValue(response(Array.from(wire, byte => new Uint8Array([byte]))));
    const frames = vi.fn(); await call(frames);
    expect(frames.mock.calls.map(([frame]) => frame)).toEqual([
      { event: 'delta', data: { text: '⚽ résumé' } }, { event: 'draft', data: { draftId: 'd' } }, { event: 'done', data: {} },
    ]);
  });

  it('ends at done and ignores trailing frames without inspecting another frame', async () => {
    harness.fetch.mockResolvedValue(new Response(done + 'event: error\ndata: {"message":"late"}\n\nevent: delta\ndata: invalid-json\n\n'));
    const frames = vi.fn(); await call(frames);
    expect(frames).toHaveBeenCalledTimes(1); expect(frames.mock.calls[0][0].event).toBe('done');
  });

  it('does not accept draft plus EOF as completion or retry the request', async () => {
    harness.fetch.mockResolvedValue(new Response('event: draft\ndata: {"draftId":"d"}\n\n'));
    const frames = vi.fn(); await expect(call(frames)).rejects.toThrow('before the reply was saved');
    expect(frames).toHaveBeenCalledTimes(1); expect(harness.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves the server trace and incident on an in-stream error followed by done', async () => {
    harness.fetch.mockResolvedValue(new Response('event: start\ndata: {"requestId":"server-id"}\n\nevent: error\ndata: {"code":"quota_exceeded","message":"Wait","incidentId":"incident"}\n\n' + done));
    const frames = vi.fn(); await expect(call(frames)).rejects.toMatchObject({ code: 'quota_exceeded', message: 'Wait', requestId: 'server-id', incidentId: 'incident' });
    expect(frames.mock.calls.map(([frame]) => frame.event)).toEqual(['start']);
  });

  it('rejects a standalone done with error finish reason', async () => {
    harness.fetch.mockResolvedValue(new Response('event: done\ndata: {"finishReason":"error"}\n\n'));
    const frames = vi.fn(); await expect(call(frames)).rejects.toThrow('could not finish'); expect(frames).not.toHaveBeenCalled();
  });

  it.each([
    { error: { code: 'ai_consent_required', message: 'Review sharing', incidentId: 'i' }, requestId: 'server-id' },
    { code: 'ai_consent_required', message: 'Review sharing', incidentId: 'i', requestId: 'server-id' },
  ])('keeps flat and nested HTTP errors correlated', async payload => {
    harness.fetch.mockResolvedValue(new Response(JSON.stringify(payload), { status: 403 }));
    await expect(call()).rejects.toMatchObject({ code: 'ai_consent_required', message: 'Review sharing', incidentId: 'i', requestId: 'server-id', httpStatus: 403 });
  });

  it('does not show an HTML proxy error as a coach reply', async () => {
    harness.fetch.mockResolvedValue(new Response('<html>upstream detail</html>', { status: 502 }));
    await expect(call()).rejects.toMatchObject({ message: 'Coach unavailable (502).', requestId: expect.any(String), httpStatus: 502 });
  });

  it('does not fetch for an already cancelled request', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(call(vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.user.getIdToken).not.toHaveBeenCalled(); expect(harness.fetch).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'account'] as const)('does not send a token resolved after %s', async change => {
    const token = deferred<string>(); harness.user.getIdToken.mockReturnValue(token.promise);
    const controller = new AbortController(), pending = call(vi.fn(), controller.signal);
    if (change === 'cancel') controller.abort(); else harness.user = { uid: 'other' };
    token.resolve('old-token'); await expect(pending).rejects.toThrow(); expect(harness.fetch).not.toHaveBeenCalled();
  });

  it('drops a response received after the account changes', async () => {
    const network = deferred<Response>(); harness.fetch.mockReturnValue(network.promise);
    const frames = vi.fn(), pending = call(frames); await Promise.resolve();
    harness.user = { uid: 'other' }; network.resolve(new Response(done));
    await expect(pending).rejects.toThrow('account changed'); expect(frames).not.toHaveBeenCalled();
  });

  it('drops frames after an account switch during the stream', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    harness.fetch.mockResolvedValue(new Response(new ReadableStream({ start(controller) { stream = controller; }, cancel })));
    const frames = vi.fn(), pending = call(frames);
    stream.enqueue(encode('event: delta\ndata: {"text":"first"}\n\n'));
    await vi.waitFor(() => expect(frames).toHaveBeenCalledTimes(1));
    harness.user = { uid: 'other' }; stream.enqueue(encode(done));
    await expect(pending).rejects.toThrow('account changed'); expect(frames).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalled();
  });

  it('cancels a blocked reader without waiting for another server chunk', async () => {
    const cancel = vi.fn(); harness.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const controller = new AbortController(), frames = vi.fn(), pending = call(frames, controller.signal);
    await Promise.resolve(); await Promise.resolve(); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(cancel).toHaveBeenCalled(); expect(frames).not.toHaveBeenCalled();
  });
});
