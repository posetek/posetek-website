import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  states: [] as any[], refs: [] as { current: any }[], stateIndex: 0, refIndex: 0,
  get: vi.fn(), stream: vi.fn(), config: { coachWorkspaceEnabled: false } as Record<string, any>,
  canChat: true, handoff: false,
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
  return { auth: { currentUser: { uid: 'owned-player' } }, db: chain };
});
vi.mock('../lib/mobile', () => ({ dateText: () => '' }));
vi.mock('../views/shared', () => ({ MultilineText: () => null }));
vi.mock('./CoachPersonalWorkout', () => ({ default: () => null }));
vi.mock('./AISharingControl', () => ({ default: function AISharingControl({ onAllowed }: { onAllowed?: () => void }) {
  return <button onClick={onAllowed}>Review AI sharing</button>;
} }));
vi.mock('./coach-prompts', async original => ({ ...await original<typeof import('./coach-prompts')>(), coachPrompts: () => [], coachToolStatus: () => '' }));
vi.mock('./coach/CoachTechnique', () => ({ CoachTechniqueLink: () => null, CoachTechniquePage: () => null }));
vi.mock('./gateway', () => ({
  useCoachConfig: () => harness.config, capabilityEnabled: () => harness.canChat,
  validHandoff: () => harness.handoff, streamCoach: harness.stream,
}));
import CoachChat from './CoachChat';
import CoachMemoryPanel, { SharingOffNotice } from './coach/CoachMemoryPanel';
import CoachSheet from './coach/CoachSheet';
import CoachHistoryMenu from './coach/CoachHistoryMenu';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}
const snapshot = (content: string) => ({ docs: [{ id: 'saved-message', data: () => ({ role: 'assistant', content }) }] });
// The first suite covers the transport, history and memory logic both layouts share, through the
// embedded (workout and drill) layout; the Coach tab's own layout has its suite below.
function render(overrides: Record<string, unknown> = {}) {
  harness.stateIndex = 0; harness.refIndex = 0;
  return CoachChat({ playerId: 'synthetic-player', preview: false, initialText: 'Yes, build it.', variant: 'embedded', ...overrides });
}
function renderTab(overrides: Record<string, unknown> = {}) {
  return render({ variant: undefined, initialText: '', athlete: { firstName: 'Jordan', lastName: 'Rivera' }, ...overrides });
}
/** Rendered text, including components that take their words as a `text` prop (messages, notes, loaders). */
const shows = (tree: ReactElement<any>, words: string) => text(tree).includes(words) ||
  !!search(tree, element => typeof element.props?.text === 'string' && element.props.text.includes(words));
const labelled = (tree: ReactElement<any>, label: string) => find(tree, element => element.props?.['aria-label'] === label);
const textarea = (tree: ReactElement<any>) => find(tree, element => element.type === 'textarea');
const typeDraft = (value: string) => { textarea(renderTab()).props.onChange({ target: { value } }); };
const abortable = () => (_body: unknown, signal: AbortSignal) => new Promise<void>((_, reject) =>
  signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
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
  beforeEach(() => {
    harness.states.length = 0; harness.refs.length = 0; harness.get.mockReset(); harness.stream.mockReset();
    harness.get.mockResolvedValue({ docs: [] }); harness.stream.mockResolvedValue(undefined); harness.config = { coachWorkspaceEnabled: false };
    harness.canChat = true; harness.handoff = false;
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
});

describe('Coach tab (the app AICoachTabView layout)', () => {
  beforeEach(() => {
    harness.states.length = 0; harness.refs.length = 0; harness.get.mockReset(); harness.stream.mockReset();
    harness.get.mockResolvedValue({ docs: [] }); harness.stream.mockResolvedValue(undefined); harness.config = { coachWorkspaceEnabled: false };
    harness.canChat = true; harness.handoff = false;
  });

  it('is the default for pose_chat and opens with the tools and the greeting card, without suggestions', () => {
    const tree = renderTab();
    expect(tree.props.className).toContain('coach-v4');
    expect(find(tree, element => element.type === CoachHistoryMenu)).toBeTruthy();
    expect(button(tree, 'AI sharing')).toBeTruthy();
    expect(() => labelled(tree, 'Coach memory')).toThrow();
    expect(text(tree)).toContain('POSETEK COACH');
    expect(text(tree)).toContain('Ready, Jordan?');
    expect(text(tree)).not.toContain('Help me plan 20 minutes of training');
    expect(textarea(tree).props.placeholder).toBe('Tell me what you need…');
    expect(labelled(tree, 'Send').props.disabled).toBe(true);
    expect(text(renderTab({ athlete: {} }))).toContain('What are we working on?');
    // The other chats keep their own layout.
    expect(render({ variant: undefined, capability: 'workout_chat' }).props.className).toBe('player-chat');
  });

  it('shows the memory tool only with the coach workspace and names pending suggestions', () => {
    harness.config = { coachWorkspaceEnabled: true };
    expect(labelled(renderTab(), 'Coach memory')).toBeTruthy();
    harness.states[7] = { workspace: { revision: 2, enabled: true }, memories: [
      { memoryId: 'p', status: 'proposed', category: 'goal', text: 'Faster first step', expiresAt: new Date(Date.now() + 86400000).toISOString() }] };
    labelled(renderTab(), 'Review coach memory suggestions').props.onClick();
    const sheet = find(renderTab(), element => element.type === CoachSheet);
    expect(sheet.props.title).toBe('Coach memory');
    expect(harness.stream).toHaveBeenCalledWith(expect.objectContaining({ context: { coachWorkspaceVersion: 1, memoryAction: { kind: 'list' } } }), expect.anything(), expect.any(Function));
  });

  it('stops a reply like the app: no error, no partial answer, the optimistic turn removed and the words not restored', async () => {
    harness.stream.mockImplementation(abortable());
    typeDraft('Plan my week');
    find(renderTab(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
    const busy = renderTab();
    expect(shows(busy, 'Plan my week')).toBe(true);
    expect(shows(busy, 'Working on it…')).toBe(true);
    labelled(busy, 'Stop').props.onClick();
    await vi.waitFor(() => expect(renderTab().props['aria-busy']).toBe(false));
    const after = renderTab();
    expect(shows(after, 'Plan my week')).toBe(false);
    expect(shows(after, 'Working on it…')).toBe(false);
    expect(text(after)).not.toContain('Reply stopped');
    expect(() => find(after, element => element.props?.role === 'alert')).toThrow();
    expect(textarea(after).props.value).toBe('');
    expect(text(after)).toContain('Ready, Jordan?');
  });

  it('shows the running tool in the app words while a reply streams', async () => {
    const pending = deferred<void>();
    harness.stream.mockImplementation((_body: unknown, _signal: AbortSignal, onFrame: (frame: unknown) => void) => {
      onFrame({ event: 'tool', data: { name: 'fetch_rep_metrics', status: 'started' } }); return pending.promise;
    });
    typeDraft('How am I doing?');
    find(renderTab(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
    expect(text(renderTab())).toContain('reading your reps…');
    pending.resolve();
    await vi.waitFor(() => expect(renderTab().props['aria-busy']).toBe(false));
    expect(text(renderTab())).not.toContain('reading your reps…');
  });

  it('reports a failure by its code with the reference, never the gateway text, and drops the turn', async () => {
    harness.stream.mockRejectedValueOnce(Object.assign(new Error('daily allowance exhausted for uid'), { code: 'quota_exceeded', requestId: 'abcdef1234567890' }));
    typeDraft('Another question');
    find(renderTab(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
    await vi.waitFor(() => expect(renderTab().props['aria-busy']).toBe(false));
    const failed = renderTab();
    expect(text(failed)).toContain("You've reached today's limit for Technique Q&A.");
    expect(text(failed)).toContain('Ref abcdef12');
    expect(text(failed)).not.toContain('daily allowance');
    expect(shows(failed, 'Another question')).toBe(false);
    expect(textarea(failed).props.value).toBe('');
    labelled(failed, 'Dismiss error').props.onClick();
    expect(text(renderTab())).not.toContain('today\'s limit');
  });

  it('keeps the words when AI sharing is off and sends them once sharing is allowed and the sheet closes', async () => {
    harness.stream.mockRejectedValueOnce(Object.assign(new Error('AI sharing is off on this browser.'), { code: 'ai_consent_required' }));
    typeDraft('Plan my week');
    find(renderTab(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
    await vi.waitFor(() => expect(renderTab().props['aria-busy']).toBe(false));
    const off = renderTab();
    expect(textarea(off).props.value).toBe('Plan my week');
    const notice = find(off, element => element.type === SharingOffNotice);
    expect(notice.props.action).toBe('send');
    const rendered = SharingOffNotice(notice.props);
    expect(text(rendered)).toContain('AI sharing is off');
    expect(text(rendered)).toContain('Turn on AI sharing and send');
    notice.props.onTurnOn();
    const sheet = find(renderTab(), element => element.type === CoachSheet);
    expect(sheet.props.title).toBe('AI sharing');
    find(sheet, element => typeof element.type === 'function' && element.type.name === 'AISharingControl').props.onAllowed();
    expect(harness.stream).toHaveBeenCalledTimes(1);
    find(renderTab(), element => element.type === CoachSheet).props.onDone();
    await vi.waitFor(() => expect(harness.stream).toHaveBeenCalledTimes(2));
    expect(harness.stream.mock.calls[1][0]).toMatchObject({ message: 'Plan my week', capability: 'pose_chat' });
  });

  it('does not resend when the AI sharing sheet closes without permission', async () => {
    harness.stream.mockRejectedValueOnce(Object.assign(new Error('off'), { code: 'ai_consent_required' }));
    typeDraft('Plan my week');
    find(renderTab(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
    await vi.waitFor(() => expect(renderTab().props['aria-busy']).toBe(false));
    find(renderTab(), element => element.type === SharingOffNotice).props.onTurnOn();
    find(renderTab(), element => element.type === CoachSheet).props.onDone();
    await Promise.resolve();
    expect(harness.stream).toHaveBeenCalledTimes(1);
    expect(text(renderTab())).toContain('AI sharing');
  });

  it('offers Build this workout or Set up my program under a completed reply and hands the request over', async () => {
    harness.handoff = true;
    const onHandoff = vi.fn();
    const request = { type: 'workout_request', playerId: 'synthetic-player', request: 'Twenty minutes', destination: 'program_intake' };
    harness.stream.mockImplementation(async (_body: unknown, _signal: AbortSignal, onFrame: (frame: unknown) => void) => { onFrame({ event: 'workout_request', data: request }); });
    typeDraft('Set up a program');
    find(renderTab({ onHandoff }), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
    await vi.waitFor(() => expect(renderTab({ onHandoff }).props['aria-busy']).toBe(false));
    button(renderTab({ onHandoff }), 'Set up my program').props.onClick();
    expect(onHandoff).toHaveBeenCalledWith(request);
    expect(() => button(renderTab(), 'Set up my program')).toThrow();
  });

  it('shows the app unavailable states with no composer', () => {
    harness.canChat = false; harness.config = { unavailable: true };
    const failed = renderTab();
    expect(text(failed)).toContain('Chat settings could not be loaded');
    expect(text(failed)).toContain('Check your connection. Chat comes back as soon as its settings load.');
    expect(() => textarea(failed)).toThrow();
    harness.config = { globalEnabled: false };
    expect(text(renderTab())).toContain("Chat isn't available in this build");
    expect(text(renderTab())).toContain("There's no gateway configured for coaching chat right now.");
  });

  it('keeps the voice mode controls where the app has them and explains they are in the iPhone app', () => {
    expect(() => button(renderTab(), 'Enter voice mode')).toThrow();
    harness.config = { capabilities: { voice_route: { enabled: true, dailyLimitPerUser: 5 } } };
    const tree = renderTab();
    expect(labelled(tree, 'Enter voice mode')).toBeTruthy();
    find(tree, element => element.type === 'button' && text(element).includes('Enter voice mode')).props.onClick();
    const sheet = find(renderTab(), element => element.type === CoachSheet);
    expect(sheet.props.title).toBe('Voice mode');
    expect(text(sheet)).toContain('Voice mode is available in the PoseTek iPhone app.');
  });

  it('lists past conversations in the History sheet with the app empty and failure states', () => {
    find(renderTab(), element => element.type === CoachHistoryMenu).props.onHistory();
    let sheet = find(renderTab(), element => element.type === CoachSheet);
    expect(sheet.props.title).toBe('History');
    expect(find(sheet, element => element.props?.['aria-label'] === 'Loading')).toBeTruthy();
    harness.states[13] = 'failed';
    expect(text(find(renderTab(), element => element.type === CoachSheet))).toContain("Couldn't load past conversations");
    harness.states[13] = 'ready';
    expect(text(find(renderTab(), element => element.type === CoachSheet))).toContain('No conversations yet');
    harness.states[5] = [{ id: 'c1', title: '  ' }, { id: 'c2', title: 'First touch plan' }];
    sheet = find(renderTab(), element => element.type === CoachSheet);
    expect(text(sheet)).toContain('Conversation');
    expect(text(sheet)).toContain('First touch plan');
  });
});

describe('Coach memory sheet content', () => {
  const later = new Date(Date.now() + 86400000).toISOString();
  const base = { updating: false, streaming: false, notice: '', error: null, confirmingForgetAll: false,
    onConfirmForgetAll: vi.fn(), onCommand: vi.fn(), onRefresh: vi.fn(), onTurnOnSharing: vi.fn() };
  it('shows loading until a snapshot arrives', () => {
    expect(text(CoachMemoryPanel({ ...base, memory: null }))).toContain('Loading memory…');
  });
  it('lists suggestions and saved memories as the app parses them', () => {
    const memory = { workspace: { revision: 4, enabled: true }, memories: [
      { memoryId: 'b', status: 'active', category: 'training_constraint', text: 'Bad left ankle', sourceQuote: 'my ankle hurts', expiresAt: later },
      { memoryId: 'a', status: 'proposed', category: 'goal', text: 'Faster first step', expiresAt: later },
      { memoryId: 'c', status: 'active', category: 'preference', text: 'No expiry is not current' },
      { memoryId: 'd', status: 'active', category: 'other', text: 'Unknown category', expiresAt: later },
    ] };
    const tree = CoachMemoryPanel({ ...base, memory });
    const all = text(tree);
    expect(all).toContain('Review suggestions');
    expect(all).toContain('Saved (1/24)');
    expect(all).toContain('training constraint');
    expect(all).toContain('You said: “my ankle hurts”');
    expect(all).not.toContain('No expiry is not current');
    expect(all).not.toContain('Unknown category');
    button(tree, 'Save').props.onClick();
    expect(base.onCommand).toHaveBeenCalledWith('confirm', { memoryId: 'a' });
    expect(button(tree, 'Dismiss')).toBeTruthy();
    expect(button(tree, 'Forget')).toBeTruthy();
    expect(button(CoachMemoryPanel({ ...base, memory, streaming: true }), 'Save').props.disabled).toBe(true);
    expect(shows(CoachMemoryPanel({ ...base, memory: { ...memory, workspace: { revision: 4, enabled: false } } }), 'Memory is paused.')).toBe(true);
    expect(shows(tree, 'Memory is paused.')).toBe(false);
  });
  it('asks before forgetting everything', () => {
    const memory = { workspace: { revision: 4, enabled: true }, memories: [] };
    button(CoachMemoryPanel({ ...base, memory }), 'Forget all memories').props.onClick();
    expect(base.onConfirmForgetAll).toHaveBeenCalledWith(true);
    const confirm = CoachMemoryPanel({ ...base, memory, confirmingForgetAll: true });
    expect(text(confirm)).toContain('Forget all coach memories?');
    button(confirm, 'Forget all').props.onClick();
    expect(base.onCommand).toHaveBeenCalledWith('forgetAll');
  });
  it('offers a refresh after a failure and the AI sharing prompt when sharing is off', () => {
    const memory = { workspace: { revision: 4, enabled: true }, memories: [] };
    const failed = CoachMemoryPanel({ ...base, memory, error: { message: 'Something went wrong. Try again shortly.', refCode: 'abcd1234', sharingOff: false } });
    expect(text(failed)).toContain('Ref abcd1234');
    button(failed, 'Refresh').props.onClick();
    expect(base.onRefresh).toHaveBeenCalled();
    const off = CoachMemoryPanel({ ...base, memory, error: { message: '', refCode: '', sharingOff: true } });
    expect(find(off, element => element.type === SharingOffNotice).props.action).toBe('load memory');
  });
});
