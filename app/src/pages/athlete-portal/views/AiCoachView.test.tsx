import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  states: [] as any[], refs: [] as { current: any }[], stateIndex: 0, refIndex: 0,
  stream: vi.fn(), observe: vi.fn(), get: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = typeof initial === 'function' ? initial() : initial;
    return [harness.states[index], (value: any) => { harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value; }];
  },
  useRef: (initial: any) => { const index = harness.refIndex++; return harness.refs[index] ||= { current: initial }; },
  useEffect: () => {},
}));
vi.mock('../../../lib/firebase', () => {
  const chain: any = { get: harness.get, onSnapshot: harness.observe };
  for (const method of ['collection', 'doc', 'orderBy', 'where', 'limit']) chain[method] = () => chain;
  return { auth: { currentUser: { uid: 'synthetic-owner' } }, db: chain };
});
vi.mock('../lib/metrics', () => ({ fullName: () => 'Synthetic athlete' }));
vi.mock('../lib/mobile', () => ({ CHAT_SUGGESTIONS: ['How did I do?'], dateText: () => '', number: () => 0, timestamp: () => null }));
vi.mock('./shared', () => ({ LockedPage: () => null, MultilineText: () => null, PageHero: () => null, PortalLoading: () => null }));
vi.mock('../player/gateway', () => ({ streamCoach: harness.stream }));
import AiCoachView from './AiCoachView';

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}
function render(access = 'coach') {
  harness.stateIndex = 0; harness.refIndex = 0;
  const outer = AiCoachView({ ctx: { access, playerId: 'player-doc', athlete: {} } as any });
  return (outer.type as (props: any) => ReactElement<any>)(outer.props);
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join('');
  return node && typeof node === 'object' ? text(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node);
}
function find(node: any, predicate: (element: ReactElement<any>) => boolean): ReactElement<any> {
  const search = (node: any): ReactElement<any> | undefined => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) { const found = search(child); if (found) return found; } return; }
    if (predicate(node)) return node;
    return search(node.props?.children);
  };
  const found = search(node); if (!found) throw new Error('Expected rendered control missing'); return found;
}
function send() {
  find(render(), e => e.type === 'textarea').props.onChange({ target: { value: 'How did I do?' } });
  find(render(), e => e.type === 'form').props.onSubmit({ preventDefault() {} });
}

beforeEach(() => {
  harness.states.length = 0; harness.refs.length = 0; harness.stream.mockReset(); harness.observe.mockReset(); harness.get.mockReset();
  harness.observe.mockReturnValue(() => {}); harness.get.mockResolvedValue({ docs: [] });
});

describe('staff athlete portal coach transport', () => {
  it('uses shared streaming with the existing non-workspace payload and recovers history only after success', async () => {
    const pending = deferred(); harness.stream.mockReturnValue(pending.promise); send();
    const [body, signal, frame] = harness.stream.mock.calls[0];
    expect(body).toEqual({ capability: 'pose_chat', playerId: 'player-doc', message: 'How did I do?' });
    expect(signal).toBeInstanceOf(AbortSignal);
    frame({ event: 'start', data: { conversationId: 'saved-conversation' } });
    frame({ event: 'delta', data: { text: 'First answer' } });
    expect(harness.states[2]).toMatchObject({ answer: 'First answer' });
    expect(harness.observe).not.toHaveBeenCalled();
    pending.resolve(); await vi.waitFor(() => expect(harness.states[4]).toBe(false));
    expect(harness.observe).toHaveBeenCalledTimes(1); expect(harness.get).toHaveBeenCalledTimes(1);
    send(); expect(harness.stream.mock.calls[1][0]).toMatchObject({ conversationId: 'saved-conversation' });
  });

  it('keeps a partial reply marked failed and does not treat an interrupted stream as saved', async () => {
    const pending = deferred(); harness.stream.mockReturnValue(pending.promise); send();
    const frame = harness.stream.mock.calls[0][2];
    frame({ event: 'start', data: { conversationId: 'in-progress' } });
    frame({ event: 'delta', data: { text: 'Partial answer' } });
    pending.reject(new Error('The connection ended before the reply was saved.'));
    await vi.waitFor(() => expect(harness.states[4]).toBe(false));
    expect(harness.states[2]).toMatchObject({ answer: 'Partial answer', failed: 'The connection ended before the reply was saved.' });
    expect(harness.observe).not.toHaveBeenCalled(); expect(harness.get).not.toHaveBeenCalled();
  });

  it('does not let a cancelled reply rebind a new conversation', async () => {
    const pending = deferred(); harness.stream.mockReturnValue(pending.promise); send();
    const [, signal, frame] = harness.stream.mock.calls[0];
    find(render(), e => e.props.id === 'newConversation').props.onClick();
    expect(signal.aborted).toBe(true);
    frame({ event: 'start', data: { conversationId: 'old-conversation' } });
    frame({ event: 'delta', data: { text: 'Late answer' } });
    pending.resolve(); await vi.waitFor(() => expect(harness.states[4]).toBe(false));
    expect(harness.states[2]).toBeNull(); expect(harness.observe).not.toHaveBeenCalled();
    send(); expect(harness.stream.mock.calls[1][0]).not.toHaveProperty('conversationId');
  });

  it('keeps shared profiles locked and preview replies local', () => {
    expect(render('shared')).toBeNull(); expect(harness.stream).not.toHaveBeenCalled();
    const tree = render('preview');
    find(tree, e => e.props['data-chat-suggestion'] === 'How did I do?').props.onClick();
    expect(harness.stream).not.toHaveBeenCalled();
    expect(text(render('preview'))).not.toContain('Late answer');
    expect(harness.states[1]).toHaveLength(2);
  });
});
