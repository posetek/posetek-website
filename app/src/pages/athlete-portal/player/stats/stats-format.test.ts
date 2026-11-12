import { describe, expect, it } from 'vitest';
import { bodyHeightText, bodyWeightText, favoriteDrill, nearestRadarAxis, parseSession, positionLabel, radarRadius, recordingStreakDays, reportDate, sessionDisplayName, sessionTiles } from './stats-format';
import type { SessionSummary } from './stats-format';

const day = (offset: number, hour = 12) => { const date = new Date(2026, 10, 11, hour); date.setDate(date.getDate() + offset); return date; };
const session = (type: string, repCount: number, date: Date | null): SessionSummary => ({ id: `${type}${date?.getTime()}`, type, repCount, date });
const now = day(0, 18);

describe('Stats formatting', () => {
  it('formats dates, positions and body measurements as the app does', () => {
    expect(reportDate(1_793_472_000_000, 'UTC')).toBe('Oct 31, 2026');
    expect(reportDate(1_793_472_000_000, 'Asia/Tokyo')).toBe('Nov 1, 2026');
    expect(positionLabel('W')).toBe('Winger'); expect(positionLabel('FB')).toBe('Full back / wing back');
    expect(positionLabel('Winger')).toBeNull(); expect(positionLabel(undefined)).toBeNull(); expect(positionLabel('toString')).toBeNull();
    expect(bodyHeightText(178)).toBe('5\'10"'); expect(bodyHeightText(182.9)).toBe('6\'0"'); expect(bodyHeightText(177.7)).toBe('5\'9"'); expect(bodyHeightText(undefined)).toBe('--');
    expect(bodyWeightText(72)).toBe('159 lbs'); expect(bodyWeightText('72')).toBe('--');
  });
  it('counts the recording streak like CoachProfileSessionAnalytics', () => {
    expect(recordingStreakDays([], now)).toBe(0);
    expect(recordingStreakDays([session('jump', 1, day(0)), session('jump', 1, day(-1)), session('sprint', 1, day(-2)), session('jump', 1, day(-4))], now)).toBe(3);
    expect(recordingStreakDays([session('jump', 1, day(-1)), session('jump', 1, day(-2))], now)).toBe(2);
    expect(recordingStreakDays([session('jump', 1, day(-2))], now)).toBe(0);
    expect(recordingStreakDays([session('jump', 1, day(2)), session('jump', 1, null)], now)).toBe(0);
  });
  it('picks the favorite drill by reps, counting a session without reps as one', () => {
    expect(favoriteDrill([session('deadballShot', 5, null), session('sprint', 0, null), session('sprint', 0, null), session('Sprint', 2, null)])).toEqual({ displayName: 'Shooting', repTotal: 5 });
    // A tie goes to the label that sorts last ("Sprint" after "Shooting" and "Jump").
    expect(favoriteDrill([session('jump', 2, null), session('sprint', 2, null)])).toEqual({ displayName: 'Sprint', repTotal: 2 });
    expect(favoriteDrill([session('deadballShot', 4, null), session('sprint', 4, null)])).toEqual({ displayName: 'Sprint', repTotal: 4 });
    expect(favoriteDrill([])).toBeNull();
    expect(sessionDisplayName('changeOfDirection')).toBe('Changeofdirection');
    expect(sessionDisplayName('broad_jump test')).toBe('Broad Jump Test');
    expect(sessionDisplayName('side_kick')).toBe('Shooting');
  });
  it('fills the three tiles, with loading and empty states', () => {
    expect(sessionTiles(null)).toEqual({ streak: '…', total: '…', favorite: '…', favoriteCaption: null });
    expect(sessionTiles([], now)).toEqual({ streak: '0 days', total: '0', favorite: '—', favoriteCaption: 'No sessions yet' });
    expect(sessionTiles([session('jump', 1, day(0))], now)).toEqual({ streak: '1 days', total: '1', favorite: 'Jump', favoriteCaption: '1 rep' });
  });
  it('reads a session document the way the app does', () => {
    const stamp = { toDate: () => day(0) };
    expect(parseSession('s1', { sessionType: 'jump', drillType: 'sprint', repCount: 3, createdAt: stamp })).toEqual({ id: 's1', type: 'jump', repCount: 3, date: day(0) });
    expect(parseSession('s2', { drillType: 'sprint' })).toEqual({ id: 's2', type: 'sprint', repCount: 0, date: null });
    expect(parseSession('s3', { repCount: 2 })).toBeNull();
  });
  it('sizes and hit-tests the radar like AthleteRadarChart', () => {
    expect(radarRadius(326, 258)).toBe(93);
    expect(radarRadius(200, 258)).toBe(44);
    expect(nearestRadarAxis(0, -10, 5)).toBeNull();
    expect(nearestRadarAxis(0, -80, 5)).toBe(0);
    expect(nearestRadarAxis(80, -20, 5)).toBe(1);
  });
});
