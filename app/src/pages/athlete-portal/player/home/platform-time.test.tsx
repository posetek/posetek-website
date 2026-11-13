import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../../lib/firebase', () => ({ auth: { currentUser: { uid: 'parent' } } }));
import { forgetPlatformTime, loadPlatformTime, parsePlatformTime, platformTimeText } from '../../../../lib/platform-time';
import type { PlatformTime } from '../../../../lib/platform-time';
import { PlatformTimeFigure } from './PlatformTimeFigure';
import { FamilyRow } from '../../../family/FamilyPage';

const time = (totalMinutes: number | null, status: PlatformTime['status']): PlatformTime => ({ totalMinutes, status, collectionStartedAtMillis: 1_790_000_000_000 });
beforeEach(forgetPlatformTime);

describe('time on PoseTek for a parent', () => {
  it('shows an available total plainly', () => {
    const html = renderToStaticMarkup(<PlatformTimeFigure time={time(200, 'available')} />);
    expect(html).toContain('Time on PoseTek'); expect(html).toContain('3 h 20 min');
  });
  it('shows a partial total as the number, with no extra words', () => {
    const html = renderToStaticMarkup(<PlatformTimeFigure time={time(45, 'partial')} />);
    expect(html).toContain('45 min'); expect(html).not.toMatch(/partial|at least|estimate/i);
  });
  it('hides the figure when unavailable or without a total', () => {
    expect(renderToStaticMarkup(<PlatformTimeFigure time={time(90, 'unavailable')} />)).toBe('');
    expect(renderToStaticMarkup(<PlatformTimeFigure time={time(null, 'available')} />)).toBe('');
    expect(renderToStaticMarkup(<PlatformTimeFigure time={null} />)).toBe('');
  });
  it('hides the figure after a failed call, and retries on a later visit', async () => {
    const call = vi.fn().mockRejectedValueOnce(Object.assign(new Error('internal'), { code: 'functions/internal' }))
      .mockResolvedValue({ data: { playerId: 'child-a', totalMinutes: 61, status: 'available', collectionStartedAtMillis: null } });
    const failed = await loadPlatformTime('parent', 'child-a', call);
    expect(failed).toBeNull(); expect(renderToStaticMarkup(<PlatformTimeFigure time={failed} />)).toBe('');
    expect(platformTimeText(await loadPlatformTime('parent', 'child-a', call))).toBe('1 h 1 min');
    // A success is kept for the session.
    await loadPlatformTime('parent', 'child-a', call); expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenCalledWith({ playerId: 'child-a' });
  });
  it('refuses an answer for another child or with an unusable shape', () => {
    expect(parsePlatformTime('child-a', { playerId: 'child-b', totalMinutes: 5, status: 'available', collectionStartedAtMillis: null })).toBeNull();
    expect(parsePlatformTime('child-a', { playerId: 'child-a', totalMinutes: -1, status: 'available', collectionStartedAtMillis: null })).toBeNull();
    expect(parsePlatformTime('child-a', { playerId: 'child-a', totalMinutes: 5, status: 'later', collectionStartedAtMillis: null })).toBeNull();
  });
  it('formats hours and minutes plainly', () => {
    expect([0, 1, 45, 60, 119.6, 200].map(minutes => platformTimeText(time(minutes, 'available')))).toEqual(['0 min', '1 min', '45 min', '1 h', '2 h', '3 h 20 min']);
  });
  it('fills the picker row slot only when there is a figure', () => {
    const row = (platformTime: PlatformTime | null) => renderToStaticMarkup(<MemoryRouter><FamilyRow child={{ id: 'child-a', name: 'Avery', platformTime }} /></MemoryRouter>);
    expect(row(time(200, 'available'))).toContain('Time on PoseTek · 3 h 20 min');
    expect(row(time(200, 'unavailable'))).not.toContain('platform-time');
    expect(row(null)).not.toContain('platform-time');
  });
});
