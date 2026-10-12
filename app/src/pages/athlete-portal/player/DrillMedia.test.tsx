import { beforeEach, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ states: [] as any[], stateIndex: 0, snapshot: null as any, url: vi.fn(), stop: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: any) => { harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value; }];
  },
  useEffect: (effect: () => void) => effect(),
}));
vi.mock('../../../lib/firebase', () => ({
  db: { collection: () => ({ doc: () => ({ onSnapshot: (callback: any) => { harness.snapshot = callback; return harness.stop; } }) }) },
  storage: { ref: (path: string) => ({ getDownloadURL: () => harness.url(path) }) },
}));
import DrillMedia from './DrillMedia';

beforeEach(() => { harness.states.length = 0; harness.stateIndex = 0; harness.url.mockReset(); harness.url.mockResolvedValue('https://synthetic.invalid/demo.mp4'); });

it('withdraws an already displayed primary demo on a pending-media catalog refresh without fetching its URL again', async () => {
  DrillMedia({ drillId: 'DRB-010' });
  const snapshot = (status: string, drillStatus: string) => ({ id: 'DRB-010', exists: true,
    data: () => ({ name: 'Speed dribble with stop zone', status: drillStatus, schemaVersion: 2,
      media: { primaryDemo: { storagePath: 'retained/video.mp4', contentType: 'video/mp4', generation: '123', status } } }) });
  await harness.snapshot(snapshot('approved', 'published'));
  expect(harness.states[1]).toHaveLength(1);
  expect(harness.url).toHaveBeenCalledTimes(1);
  await harness.snapshot(snapshot('pending', 'draft'));
  expect(harness.states[1]).toEqual([]);
  expect(harness.states[0].status).toBe('draft');
  expect(harness.url).toHaveBeenCalledTimes(1);
});
