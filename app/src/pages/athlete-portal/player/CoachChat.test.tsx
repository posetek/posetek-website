import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  states: [] as any[], refs: [] as { current: any }[], stateIndex: 0, refIndex: 0,
  get: vi.fn(), stream: vi.fn(), config: { coachWorkspaceEnabled: false },
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = typeof initial === 'function' ? initial() : initial;
    return [harness.states[index], (value: any) => { harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value; }];
  },
  useRef: (initial: any) => {
    const index = harness.refIndex++;
    return harness.refs[index] ||= { current: initial };
  },
  useEffect: () => {},
}));
vi.mock('../../../lib/firebase', () => {
  const chain: any = { get: harness.get };
  for (const method of ['collection', 'doc', 'orderBy']) chain[method] = () => chain;
  return { auth: { currentUser: { uid: 'owned-player', getIdToken: async () => 'synthetic-token' } }, db: chain };
});
vi.mock('../lib/mobile', () => ({ dateText: () => '' }));
vi.mock('../views/shared', () => ({ MultilineText: () => null }));
vi.mock('./CoachPersonalWorkout', () => ({ default: () => null }));
vi.mock('./AISharingControl', () => ({ default: function AISharingControl({ onAllowed }: { onAllowed?: () => void }) {
  return <button onClick={onAllowed}>Review AI sharing</button>;
} }));
vi.mock('./coach-prompts', () => ({ coachPrompts: () => [], coachToolStatus: () => '' }));
vi.mock('./gateway', () => ({
  useCoachConfig: () => harness.config, capabilityEnabled: () => true,
  validHandoff: () => false, streamCoach: harness.stream,
}));
import CoachChat from './CoachChat';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}
const snapshot = (content: string) => ({ docs: [{ id: 'saved-message', data: () => ({ role: 'assistant', content }) }] });
function render(overrides: Record<string, unknown> = {}) {
  harness.stateIndex = 0; harness.refIndex = 0;
  return CoachChat({ playerId: 'synthetic-player', preview: false, initialText: 'Yes, build it.', ...overrides });
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join('');
  return node && typeof node === 'object' ? text(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node);
}
function find(node: any, predicate: (element: ReactElement<any>) => boolean): ReactElement<any> {
  if (Array.isArray(node)) {
    for (const child of node) { const found = search(child, predicate); if (found) return found; }
  } else { const found = search(node, predicate); if (found) return found; }
  throw new Error('Expected rendered control missing');
}
function search(node: any, predicate: (element: ReactElement<any>) => boolean): ReactElement<any> | undefined {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) { const found = search(child, predicate); if (found) return found; } return; }
  if (predicate(node)) return node;
  return search(node.props?.children, predicate);
}
const button = (tree: ReactElement<any>, label: string) => find(tree, element => element.type === 'button' && text(element) === label);
const submit = (tree: ReactElement<any>) => find(tree, element => element.type === 'form').props.onSubmit({ preventDefault() {} });
function history() {
  render(); harness.states[5] = [{ id: 'selected-chat', title: 'Selected chat' }, { id: 'other-chat', title: 'Other chat' }];
  button(render(), 'History').props.onClick(); return render();
}

describe('Coach chat history and AI sharing recovery', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    harness.states.length = 0; harness.refs.length = 0; harness.get.mockReset(); harness.stream.mockReset();
    harness.get.mockResolvedValue({ docs: [] }); harness.stream.mockResolvedValue(undefined); harness.config = { coachWorkspaceEnabled: false };
  });

  it('blocks the same-event send until history loads, then sends to the selected conversation', async () => {
    const pending = deferred<ReturnType<typeof snapshot>>(); harness.get.mockReturnValueOnce(pending.promise);
    const oldTree = history(); button(oldTree, 'Selected chat').props.onClick();
    // A submit before React can render the disabled composer exposed the live race.
    submit(oldTree); expect(harness.stream).not.toHaveBeenCalled();
    const busy = render();
    expect(busy.props['aria-busy']).toBe(true);
    expect(find(busy, element => element.type === 'textarea').props.disabled).toBe(true);
    expect(find(busy, element => element.props['aria-label'] === 'Send message').props.disabled).toBe(true);
    expect(text(busy)).toContain('Loading your conversation…');
    expect(text(busy)).not.toContain('What do you want to work on?');
    pending.resolve(snapshot('Your saved workout request.'));
    await vi.waitFor(() => expect(render().props['aria-busy']).toBe(false));
    submit(render());
    await vi.waitFor(() => expect(harness.stream).toHaveBeenCalledTimes(1));
    expect(harness.stream.mock.calls[0][0]).toMatchObject({ playerId: 'synthetic-player', conversationId: 'selected-chat', message: 'Yes, build it.' });
  });

  it('lets New conversation cancel a pending load without an old reply rebinding the next send', async () => {
    const pending = deferred<ReturnType<typeof snapshot>>(); harness.get.mockReturnValueOnce(pending.promise);
    const tree = history(); button(tree, 'Selected chat').props.onClick();
    button(render(), 'New conversation').props.onClick();
    expect(render().props['aria-busy']).toBe(false);
    pending.resolve(snapshot('Old chat content.')); await Promise.resolve(); await Promise.resolve();
    submit(render());
    await vi.waitFor(() => expect(harness.stream).toHaveBeenCalledTimes(1));
    expect(harness.stream.mock.calls[0][0]).not.toHaveProperty('conversationId');
    expect(text(render())).not.toContain('Old chat content.');
  });

  it('keeps a newer load blocked when an older server read finishes', async () => {
    const first = deferred<ReturnType<typeof snapshot>>(), second = deferred<ReturnType<typeof snapshot>>();
    harness.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const tree = history(); button(tree, 'Selected chat').props.onClick(); button(tree, 'Other chat').props.onClick();
    first.resolve(snapshot('Older conversation.')); await Promise.resolve(); await Promise.resolve();
    expect(render().props['aria-busy']).toBe(true); submit(render()); expect(harness.stream).not.toHaveBeenCalled();
    second.resolve(snapshot('Newer conversation.'));
    await vi.waitFor(() => expect(render().props['aria-busy']).toBe(false)); submit(render());
    await vi.waitFor(() => expect(harness.stream).toHaveBeenCalledTimes(1));
    expect(harness.stream.mock.calls[0][0].conversationId).toBe('other-chat');
  });

  it('releases the composer and shows a failed history read without binding that conversation', async () => {
    const pending = deferred<ReturnType<typeof snapshot>>(); harness.get.mockReturnValueOnce(pending.promise);
    button(history(), 'Selected chat').props.onClick(); pending.reject(new Error('History unavailable'));
    await vi.waitFor(() => expect(render().props['aria-busy']).toBe(false));
    expect(text(render())).toContain('History unavailable');
    expect(find(render(), element => element.type === 'textarea').props.disabled).toBe(false);
    submit(render()); await vi.waitFor(() => expect(harness.stream).toHaveBeenCalledTimes(1));
    expect(harness.stream.mock.calls[0][0]).not.toHaveProperty('conversationId');
  });

  it('keeps a blocked request available and offers AI sharing review without automatically retrying', async () => {
    harness.stream.mockRejectedValueOnce(Object.assign(new Error('Review AI sharing before using your coach.'), { code: 'ai_consent_required' }));
    submit(render());
    await vi.waitFor(() => expect(render().props['aria-busy']).toBe(false));
    const blocked = render();
    expect(text(blocked)).toContain('Review AI sharing before using your coach.');
    expect(find(blocked, element => element.type === 'textarea').props.value).toBe('Yes, build it.');
    const control = find(blocked, element => typeof element.type === 'function' && element.type.name === 'AISharingControl');
    expect(control.props.preview).toBe(false);
    const review = (control.type as (props: any) => ReactElement<any>)(control.props);
    button(review, 'Review AI sharing').props.onClick();
    expect(text(render())).not.toContain('Review AI sharing before using your coach.');
    expect(find(render(), element => element.type === 'textarea').props.value).toBe('Yes, build it.');
    expect(harness.stream).toHaveBeenCalledTimes(1);
  });

  it('does not hide an unrelated coach failure when AI sharing is allowed', async () => {
    harness.stream.mockRejectedValueOnce(Object.assign(new Error('The coach is temporarily unavailable.'), { code: 'unavailable' }));
    submit(render());
    await vi.waitFor(() => expect(render().props['aria-busy']).toBe(false));
    const control = find(render(), element => typeof element.type === 'function' && element.type.name === 'AISharingControl');
    control.props.onAllowed();
    expect(text(render())).toContain('The coach is temporarily unavailable.');
    expect(harness.stream).toHaveBeenCalledTimes(1);
  });

  it('sends valid memory commands through the real transport without chat or workout context', async () => {
    harness.config = { coachWorkspaceEnabled: true };
    const props = { personalStore: { enabled: true }, context: { unrelated: 'conversation-context' } };
    const { streamCoach } = await vi.importActual<typeof import('./gateway')>('./gateway');
    harness.stream.mockImplementation(streamCoach);
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      // Mirror chat ingress / coach_chat validation instead of accepting an invalid envelope.
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) {
        return new Response(JSON.stringify({ code: 'invalid_request', message: 'message must contain 1..2000 characters' }), { status: 400 });
      }
      return new Response('event: memory\ndata: ' + JSON.stringify({ workspace: { revision: 3, enabled: true },
        memories: [{ memoryId: 'm', status: 'active', text: 'Preference', category: 'preference' }] }) + '\n\nevent: done\ndata: {}\n\n');
    });
    vi.stubGlobal('fetch', fetch);
    button(render(props), 'Coach memory').props.onClick();
    await vi.waitFor(() => expect(render(props).props['aria-busy']).toBe(false));
    expect(harness.stream.mock.calls[0][0]).toEqual({ capability: 'pose_chat', playerId: 'synthetic-player', message: 'Update coach memory',
      context: { coachWorkspaceVersion: 1, memoryAction: { kind: 'list' } } });
    button(render(props), 'Forget').props.onClick();
    await vi.waitFor(() => expect(harness.stream).toHaveBeenCalledTimes(2));
    expect(harness.stream.mock.calls[1][0]).toEqual({ capability: 'pose_chat', playerId: 'synthetic-player', message: 'Update coach memory',
      context: { coachWorkspaceVersion: 1, memoryAction: { kind: 'forget', memoryId: 'm', expectedRevision: 3 } } });
    await vi.waitFor(() => expect(render(props).props['aria-busy']).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) {
      const outgoing = JSON.parse(fetch.mock.calls[i][1].body as string);
      expect(outgoing).toEqual({ ...harness.stream.mock.calls[i][0], schemaVersion: 1,
        clientVersion: '1.1+4', requestId: expect.any(String) });
      expect(outgoing.message).toBe('Update coach memory');
      expect(outgoing).not.toHaveProperty('conversationId');
    }
    expect(harness.get).not.toHaveBeenCalled();
    expect(text(render(props))).not.toContain('Update coach memory');
    expect(text(render(props))).not.toContain('message must contain');
  });

});
