import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  states: [] as any[], refs: [] as { current: any }[], stateIndex: 0, refIndex: 0, effectIndex: 0,
  effects: [] as { dependencies?: unknown[]; cleanup?: () => void }[], pendingEffects: [] as (() => void)[],
  authChanged: null as null | (() => void), unsubscribe: vi.fn(), setSharing: vi.fn(), allowed: vi.fn(),
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
  useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => {
    const index = harness.effectIndex++, previous = harness.effects[index];
    if (previous && dependencies && previous.dependencies?.length === dependencies.length && dependencies.every((value, i) => Object.is(value, previous.dependencies?.[i]))) return;
    harness.pendingEffects.push(() => {
      previous?.cleanup?.();
      harness.effects[index] = { dependencies, cleanup: effect() || undefined };
    });
  },
}));
vi.mock('../../../lib/firebase', () => ({ auth: { onAuthStateChanged: (changed: () => void) => {
  harness.authChanged = changed;
  changed();
  return harness.unsubscribe;
} } }));
vi.mock('./ai-sharing', () => ({ setAISharing: harness.setSharing }));
import AISharingControl from './AISharingControl';

function render(preview = false) {
  harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0;
  const tree = AISharingControl({ preview, onAllowed: harness.allowed });
  harness.pendingEffects.splice(0).forEach(effect => effect());
  return tree;
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join('');
  return node && typeof node === 'object' ? text(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node);
}
function search(node: any, predicate: (element: ReactElement<any>) => boolean): ReactElement<any> | undefined {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) { const found = search(child, predicate); if (found) return found; } return; }
  return predicate(node) ? node : search(node.props?.children, predicate);
}
function button(tree: ReactElement<any>, label: string): ReactElement<any> {
  const control = search(tree, element => element.type === 'button' && text(element) === label);
  if (!control) throw new Error(`Rendered button missing: ${label}`);
  return control;
}
function open(preview = false) {
  button(render(preview), 'Review AI sharing').props.onClick();
  return render(preview);
}
function deferred() {
  let resolve!: () => void, reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  harness.states.length = 0; harness.refs.length = 0; harness.effects.length = 0; harness.pendingEffects.length = 0;
  harness.authChanged = null; harness.unsubscribe.mockReset(); harness.setSharing.mockReset(); harness.allowed.mockReset();
  harness.setSharing.mockResolvedValue(undefined);
});
afterEach(() => { harness.effects.forEach(effect => effect.cleanup?.()); });

describe('AI sharing explicit choice control', () => {
  it('does not save a preference when mounted, reopened, or inspected', () => {
    let tree = render();
    expect(button(tree, 'Review AI sharing').props['aria-expanded']).toBe(false);
    expect(text(tree)).not.toContain('Allow AI sharing');
    tree = open();
    expect(button(tree, 'Review AI sharing').props['aria-expanded']).toBe(true);
    expect(text(tree)).toContain('Google Vertex AI or Anthropic');
    expect(button(tree, 'Allow AI sharing').props.disabled).toBe(false);
    expect(button(tree, 'Keep AI sharing off').props.disabled).toBe(false);
    button(tree, 'Review AI sharing').props.onClick();
    open();
    expect(harness.setSharing).not.toHaveBeenCalled();
    expect(harness.allowed).not.toHaveBeenCalled();
  });

  it('waits for an explicit allowance acknowledgement and does not duplicate the request or callback', async () => {
    const pending = deferred(); harness.setSharing.mockReturnValueOnce(pending.promise);
    const tree = open(), allow = button(tree, 'Allow AI sharing');
    allow.props.onClick(); allow.props.onClick();
    expect(harness.setSharing).toHaveBeenCalledExactlyOnceWith(true);
    expect(harness.allowed).not.toHaveBeenCalled();
    expect(button(render(), 'Allow AI sharing').props.disabled).toBe(true);
    expect(button(render(), 'Keep AI sharing off').props.disabled).toBe(true);
    expect(text(render())).toContain('Saving your choice…');
    pending.resolve();
    await vi.waitFor(() => expect(harness.allowed).toHaveBeenCalledTimes(1));
    expect(text(render())).toContain('You can send your request when you are ready.');
    expect(button(render(), 'Allow AI sharing').props.disabled).toBe(false);
    render(); render();
    expect(harness.setSharing).toHaveBeenCalledTimes(1);
    expect(harness.allowed).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)('resets on account change and ignores an earlier allowance that later %ss', async outcome => {
    const oldChoice = deferred(); harness.setSharing.mockReturnValueOnce(oldChoice.promise);
    button(open(), 'Allow AI sharing').props.onClick();
    harness.authChanged?.();
    expect(button(render(), 'Review AI sharing').props['aria-expanded']).toBe(false);
    expect(text(open())).not.toContain('Saving your choice…');
    if (outcome === 'resolve') oldChoice.resolve(); else oldChoice.reject(new Error('Old account request failed.'));
    await Promise.resolve(); await Promise.resolve();
    expect(harness.allowed).not.toHaveBeenCalled();
    expect(text(render())).not.toContain('AI sharing allowed.');
    expect(text(render())).not.toContain('Old account request failed.');
    expect(button(render(), 'Allow AI sharing').props.disabled).toBe(false);
  });

  it('does not let an old account response finish the current account choice', async () => {
    const oldChoice = deferred(), currentChoice = deferred();
    harness.setSharing.mockReturnValueOnce(oldChoice.promise).mockReturnValueOnce(currentChoice.promise);
    button(open(), 'Allow AI sharing').props.onClick();
    harness.authChanged?.();
    button(open(), 'Keep AI sharing off').props.onClick();
    oldChoice.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(text(render())).toContain('Saving your choice…');
    expect(button(render(), 'Allow AI sharing').props.disabled).toBe(true);
    expect(harness.allowed).not.toHaveBeenCalled();
    currentChoice.resolve();
    await vi.waitFor(() => expect(text(render())).toContain('New AI requests are off on this browser.'));
    expect(harness.setSharing.mock.calls).toEqual([[true], [false]]);
    expect(harness.allowed).not.toHaveBeenCalled();
  });

  it('shows a failed account-wide withdrawal without claiming that it succeeded', async () => {
    const message = 'AI sharing is off on this browser. Account-wide withdrawal could not be confirmed. Retry when connected.';
    harness.setSharing.mockRejectedValueOnce(new Error(message));
    button(open(), 'Keep AI sharing off').props.onClick();
    await vi.waitFor(() => expect(text(render())).toContain(message));
    expect(harness.setSharing).toHaveBeenCalledExactlyOnceWith(false);
    expect(search(render(), element => element.props.role === 'alert')?.props.children).toBe(message);
    expect(text(render())).not.toContain('Your saved workouts and results remain available.');
    expect(button(render(), 'Keep AI sharing off').props.disabled).toBe(false);
    expect(harness.allowed).not.toHaveBeenCalled();
  });

  it('keeps preview choices local and labels their limited effect', async () => {
    button(open(true), 'Allow AI sharing').props.onClick();
    await vi.waitFor(() => expect(text(render(true))).toContain('Preview only. No account preference was changed.'));
    expect(harness.setSharing).not.toHaveBeenCalled();
    expect(harness.authChanged).toBeNull();
  });
});
