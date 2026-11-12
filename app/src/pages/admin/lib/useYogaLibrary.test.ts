// One Yoga-section status change as section state: a failed write, a committed
// write whose re-read failed, a clean change, and the preview.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const yoga = vi.hoisted(() => ({ update: vi.fn(), loadPose: vi.fn() }));
vi.mock('../../../lib/firebase', () => ({ default: {}, auth: {}, db: {}, storage: {}, cloud: {} }));
vi.mock('./yogaLibrary', () => ({
  updateYogaPoseStatus: yoga.update, loadYogaPose: yoga.loadPose,
  loadYogaLibrary: vi.fn(), loadYogaLibraryVersion: vi.fn(),
}));

import { normalizeYogaPose } from '../../../lib/contracts/yogaLibrary';
import { SAVED_REFRESH_FAILED_MESSAGE } from './catalog';
import { yogaStatusChange } from './useYogaLibrary';

const at = (seconds: number) => ({ seconds, nanoseconds: 0 });
const pose = (id: string, name: string, status: string, version = '1.0.3', seconds = 1) =>
  normalizeYogaPose(id, { schemaVersion: 1, name, status, catalogVersion: version, updatedAt: at(seconds), yoga: { posture: 'seated' } });
const boat = pose('athlete_boat', 'Boat', 'published');
const mountain = pose('mountain', 'Mountain', 'published');
const ready = { kind: 'ready' as const, poses: [boat, mountain], version: '1.0.3' };

beforeEach(() => { yoga.update.mockReset(); yoga.loadPose.mockReset(); });

describe('yoga status change', () => {
  it('leaves every pose (and so the select) on the stored status and reports the error on that row when the write fails', async () => {
    yoga.update.mockRejectedValue(new Error('This pose changed since the list loaded. Reload and make your change again.'));
    const result = await yogaStatusChange(ready, boat, 'archived');
    expect(result.load).toBe(ready);
    expect(result.load.poses.find(entry => entry.drillId === 'athlete_boat')?.status).toBe('published');
    expect(result.message).toEqual({ drillId: 'athlete_boat', kind: 'error', text: 'This pose changed since the list loaded. Reload and make your change again.' });
    expect(yoga.loadPose).not.toHaveBeenCalled();
  });

  it('treats a committed write as saved when the re-read fails: the row takes the committed values and a notice asks for a reload', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    yoga.update.mockResolvedValue('1.0.4');
    yoga.loadPose.mockRejectedValue(new Error('Failed to get document because the client is offline.'));
    const result = await yogaStatusChange(ready, boat, 'archived');
    expect(result.load.version).toBe('1.0.4');
    expect(result.load.poses.find(entry => entry.drillId === 'athlete_boat')).toMatchObject({ status: 'archived', catalogVersion: '1.0.4' });
    expect(result.load.poses.find(entry => entry.drillId === 'mountain')).toBe(mountain);
    expect(result.message).toEqual({ drillId: 'athlete_boat', kind: 'notice', text: SAVED_REFRESH_FAILED_MESSAGE });
    expect(result.message?.kind).not.toBe('error');
    warn.mockRestore();
  });

  it('uses the re-read pose, with its new updatedAt baseline, after a clean change', async () => {
    const fresh = pose('athlete_boat', 'Boat', 'archived', '1.0.4', 99);
    yoga.update.mockResolvedValue('1.0.4');
    yoga.loadPose.mockResolvedValue(fresh);
    const result = await yogaStatusChange(ready, boat, 'archived');
    expect(result.message).toBeNull();
    expect(result.load.poses[0]).toBe(fresh);
    expect(yoga.update).toHaveBeenCalledWith(boat, 'archived');
  });

  it('reports a refused publish on its row', async () => {
    yoga.update.mockRejectedValue(new Error(`athlete_boat must pass validation before it can be published.`));
    const result = await yogaStatusChange(ready, pose('athlete_boat', 'Boat', 'draft'), 'published');
    expect(result.message).toEqual({ drillId: 'athlete_boat', kind: 'error', text: 'athlete_boat must pass validation before it can be published.' });
    expect(result.load).toBe(ready);
  });

  it('writes and reads nothing in the preview', async () => {
    const result = await yogaStatusChange(ready, boat, 'archived', true);
    expect(yoga.update).not.toHaveBeenCalled();
    expect(yoga.loadPose).not.toHaveBeenCalled();
    expect(result.load.version).toBe('1.0.4');
    expect(result.load.poses[0]).toMatchObject({ status: 'archived', catalogVersion: '1.0.4' });
    expect(result.message).toBeNull();
  });
});
