import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import runnerSvg from './posetek-runner-v2-dark.svg?raw';
import { runnerDocument } from './CoachRunner';
import { CoachReplyText, coachReplyLines } from './coach-reply';
import { coachErrorMessage, coachRefCode, quotaResetTime } from './coach-errors';

const html = (text: string) => renderToStaticMarkup(<CoachReplyText text={text} />);

describe('coach reply formatting (CoachReplyFormatting)', () => {
  it('rewrites block markdown the way the app does', () => {
    expect(coachReplyLines('## Plan\n- one\n* two\n---\n```\n> quoted\n>80% max HR')).toEqual([
      { text: 'Plan', bold: true }, { text: '• one', bold: false }, { text: '• two', bold: false },
      { text: 'quoted', bold: false }, { text: '>80% max HR', bold: false },
    ]);
    expect(coachReplyLines('##')).toEqual([{ text: '', bold: false }]);
  });
  it('renders emphasis and links but keeps literal markers', () => {
    expect(html('Do **3 sets** of *slow* reps')).toBe('Do <strong>3 sets</strong> of <em>slow</em> reps');
    expect(html('3*10 squats, 8~10 reps')).toBe('3*10 squats, 8~10 reps');
    expect(html('~~old~~ new')).toBe('<s>old</s> new');
    expect(html('Use `tempo` [guide](https://posetek.net/guide)')).toBe('Use <code>tempo</code> <a href="https://posetek.net/guide" target="_blank" rel="noreferrer">guide</a>');
    expect(html('[bad](javascript:alert(1))')).toBe('[bad](javascript:alert(1))');
    expect(html('an **unclosed bold')).toBe('an **unclosed bold');
    expect(html('Line one\nLine two')).toBe('Line one<br/>Line two');
  });
});

describe('coach errors (LLMError.userMessage)', () => {
  it('maps gateway codes to the app sentences', () => {
    expect(coachErrorMessage('provider_error')).toBe('The coaching model is unavailable right now. Try again shortly.');
    expect(coachErrorMessage('capability_disabled')).toBe('This feature is temporarily unavailable.');
    expect(coachErrorMessage(undefined)).toBe('Something went wrong. Try again shortly.');
    expect(coachErrorMessage('quota_exceeded', new Date('2026-11-11T15:00:00Z')))
      .toBe(`You've reached today's limit for Technique Q&A. It resets at ${quotaResetTime(new Date('2026-11-11T15:00:00Z'))} your time.`);
    expect(quotaResetTime(new Date('2026-11-11T15:00:00Z'), 'en-US', 'UTC')).toBe('12:00 AM');
  });
  it('quotes the first eight characters of the request id', () => {
    expect(coachRefCode('abcdef1234')).toBe('abcdef12');
    expect(coachRefCode(undefined)).toBe('');
  });
});

describe('coach runner (mobile #109 scripts/check-coach-runner.mjs)', () => {
  it('keeps the 33-landmark stride, its 900 ms loop and its motion and lifecycle guards', () => {
    const script = runnerSvg.match(/<script><!\[CDATA\[([\s\S]*?)\]\]><\/script>/)![1];
    const nodes = [...runnerSvg.matchAll(/<(line|circle) ([^>]+)\/>/g)].map(([, tag, attributes]) => ({
      tag, attributes: Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])) as Record<string, string>,
      getAttribute(key: string) { return this.attributes[key]; },
      setAttribute(key: string, value: unknown) { this.attributes[key] = String(value); },
    }));
    const bones = nodes.filter(node => node.tag === 'line'), joints = nodes.filter(node => node.tag === 'circle');
    assert.equal(bones.length, 30); assert.equal(joints.length, 33);
    const events: Record<string, () => void> = {}, frames = new Map<number, (time: number) => void>();
    let next = 0;
    const motion = { matches: false, addEventListener: (_: string, callback: () => void) => { events.motion = callback; } };
    const window = { runnerReducedMotion: false, addEventListener: (name: string, callback: () => void) => { events[name] = callback; } };
    const document = { visibilityState: 'visible', addEventListener: (name: string, callback: () => void) => { events[name] = callback; },
      querySelector: () => ({ querySelectorAll: (selector: string) => (selector === '[data-segment]' ? bones : joints), querySelector: () => ({ append() {} }) }) };
    runInNewContext(script, { document, matchMedia: () => motion, window,
      requestAnimationFrame: (callback: (time: number) => void) => { frames.set(++next, callback); return next; },
      cancelAnimationFrame: (id: number) => frames.delete(id) });
    const snapshot = () => nodes.map(node => ({ ...node.attributes }));
    const tick = (time: number) => {
      expect(frames.size).toBe(1);
      const [id, callback] = frames.entries().next().value!;
      frames.delete(id); callback(time);
      for (const node of nodes) for (const key of node.tag === 'line' ? ['x1', 'y1', 'x2', 'y2'] : ['cx', 'cy']) {
        const value = Number(node.attributes[key]); expect(value >= 0 && value <= 100).toBe(true);
      }
    };
    tick(0); const contact = snapshot();
    for (let time = 15; time < 900; time += 15) tick(time);
    expect(snapshot()).not.toEqual(contact);
    tick(900); expect(snapshot()).toEqual(contact);
    motion.matches = true; events.motion(); expect(frames.size).toBe(0); expect(snapshot()).toEqual(contact);
    motion.matches = false; events.motion(); document.visibilityState = 'hidden'; events.visibilitychange(); expect(frames.size).toBe(0);
    document.visibilityState = 'visible'; events.visibilitychange(); expect(frames.size).toBe(1);
    events.pagehide(); expect(frames.size).toBe(0);
  });
  it('plays one 6 s pass in a locked-down page that reports its own pass number', () => {
    const page = runnerDocument(7);
    expect(page).toContain("default-src 'none'");
    expect(page).toContain('animation:runner-travel 6s linear forwards');
    expect(page).toContain('translateX(100vw)');
    expect(page).toContain('posetekCoachRunner: 7');
    expect(page).toContain('class="pose-runner pose-runner-v2"');
  });
});
