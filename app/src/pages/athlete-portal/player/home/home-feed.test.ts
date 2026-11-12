import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../../lib/firebase', () => ({ default: {}, auth: {}, db: {}, cloud: {}, storage: {} }));
import {
  audienceLabel, barFractions, benchmarkRating, chartLabel, displayMetrics, feedUnavailable, formatNumber, outdoorPaths,
  phaseForError, remoteFeedEnabled, shownBars, subtitleText, visibilityCandidate,
} from './home-feed';
import type { HomeActivity } from './home-feed';
import { previewActivities } from './preview-feed';

const activity = (over: Partial<HomeActivity> = {}): HomeActivity => ({ ...previewActivities(0)[0], ...over });

describe('Home feed states (CommunityFeedViewModel.phase)', () => {
  it('gates on FAILED_PRECONDITION, refuses on PERMISSION_DENIED and fails otherwise, with the server message', () => {
    expect(phaseForError({ code: 'functions/failed-precondition', message: 'Not yet' })).toEqual({ kind: 'gated', message: 'Not yet' });
    expect(phaseForError({ code: 'permission-denied', message: 'No' })).toEqual({ kind: 'refused', message: 'No' });
    expect(phaseForError({ code: 'functions/unavailable', message: 'Offline' })).toEqual({ kind: 'failed', message: 'Offline' });
    expect(phaseForError(new Error('Boom'))).toEqual({ kind: 'failed', message: 'Boom' });
  });
  it('treats the feed as unavailable when the flag is off or the context did not load', () => {
    expect(feedUnavailable(false, { kind: 'ready' })).toBe(true);
    for (const kind of ['gated', 'refused', 'failed'] as const) expect(feedUnavailable(true, { kind, message: '' })).toBe(true);
    for (const kind of ['idle', 'loading', 'ready'] as const) expect(feedUnavailable(true, { kind })).toBe(false);
  });
  it('turns the feed on only for a true communityFeedEnabled boolean (release V4TabPolicy)', () => {
    expect(remoteFeedEnabled({ communityFeedEnabled: true })).toBe(true);
    for (const value of [false, 1, 'true', undefined]) expect(remoteFeedEnabled({ communityFeedEnabled: value })).toBe(false);
    expect(remoteFeedEnabled(null)).toBe(false);
  });
});

describe('Activity card formatting (SocialFormat, V4SocialActivityCard)', () => {
  it('formats numbers as the app does', () => {
    expect(formatNumber(12, '')).toBe('12');
    expect(formatNumber(58.44, 'mph')).toBe('58.4');
    expect(formatNumber(3.456, 's')).toBe('3.46');
    expect(formatNumber(5.5, 'min/km')).toBe('5:30');
    expect(formatNumber(300, 'min/km')).toBe('300');
    expect(formatNumber(300.25, 'min/km')).toBe('300.3');
  });
  it('shows outdoor distances, speeds and paces in miles', () => {
    const run = displayMetrics(activity({ outdoorActivity: 'run', metrics: [{ label: 'D', value: 1.609344, unit: 'km' }, { label: 'P', value: 5, unit: 'min/km' }, { label: 'S', value: 16.09344, unit: 'km/h' }] }));
    expect(run.map(metric => [Number(metric.value.toFixed(3)), metric.unit])).toEqual([[1, 'mi'], [8.047, 'min/mile'], [10, 'mph']]);
    expect(displayMetrics(activity({ metrics: [{ label: 'D', value: 2, unit: 'km' }] }))[0].unit).toBe('km');
  });
  it('labels the audience, the subtitle and the benchmark line', () => {
    expect(audienceLabel(activity({ audience: 'organization' }))).toBe('Organization + friends');
    expect(audienceLabel(activity({ audience: 'organization', outdoorActivity: 'run' }))).toBe('My organization');
    expect(audienceLabel(activity({ audience: 'private' }))).toBe('Only me');
    expect(subtitleText(activity({ subtitle: 'Split squat', partial: true }))).toBe('Split squat · Finished with partial work');
    expect(benchmarkRating(103.5)).toBe('104 benchmark rating');
  });
  it('draws at most 30 bars, each between 8 % and the full height', () => {
    const values = Array.from({ length: 35 }, (_, index) => index);
    expect(shownBars(values)).toHaveLength(30);
    expect(barFractions([0, 5, 10, Number.NaN])).toEqual([0.08, 0.5, 1, 0.08]);
    expect(barFractions([0.5])).toEqual([0.5]);
    expect(chartLabel([53.2, 58.4])).toBe('Last 2 rep results: 53.2, 58.4');
  });
  it('keeps only valid route points, four lines of 24', () => {
    const line = Array.from({ length: 30 }, (_, index) => [index % 32, 40]);
    expect(outdoorPaths([[[1, 2], [32, 1], [3]], ...Array(5).fill([[1, 1]])])).toEqual([[[1, 2]], [[1, 1]], [[1, 1]], [[1, 1]]]);
    expect(outdoorPaths([line])[0]).toEqual([]);
  });
  it('plays the preview at least half on screen nearest the middle', () => {
    const frame = (top: number, visible = 1) => ({ top, height: 100, width: 100, visibleArea: 10_000 * visible });
    expect(visibilityCandidate({ a: frame(0), b: frame(300), c: frame(600, 0.4) }, 400, new Set())).toBe('b');
    expect(visibilityCandidate({ a: frame(0), b: frame(300) }, 400, new Set(['b']))).toBe('a');
    expect(visibilityCandidate({ b: frame(150), a: frame(250) }, 250, new Set())).toBe('a');
    expect(visibilityCandidate({}, 400, new Set())).toBeNull();
  });
});
