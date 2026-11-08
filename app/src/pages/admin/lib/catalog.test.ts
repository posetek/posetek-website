import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STALE_DRILL_MESSAGE, keepEquipmentOrder, mediaPlaybackUrl, sameStamp, updateDrill, type DrillWrite } from './catalog';

const harness = vi.hoisted(() => ({
  save: vi.fn(), transaction: vi.fn(), media: vi.fn(), txUpdate: vi.fn(), txSet: vi.fn(),
  currentVersion: '1.0.8', stored: {} as Record<string, unknown>,
}));
vi.mock('../../../lib/firebase', () => ({
  default: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } } },
  auth: { currentUser: { uid: 'admin-test' } }, storage: { ref: () => ({ getDownloadURL: harness.media }) },
  cloud: { httpsCallable: (name: string) => { if (name !== 'trainingSaveDrill') throw new Error(name); return harness.save; } },
  db: {
    collection: (collection: string) => ({ doc: (id: string) => ({ id, collection, get: async () => ({ data: () => harness.stored }) }) }),
    runTransaction: harness.transaction,
  },
}));

const write: DrillWrite = { name: 'Goblet squat', domain: 'strength', minAge: 10, maxAge: 18,
  difficultyLevel: 2, equipment: ['dumbbells'], requiresPartner: false, positionSpecific: null,
  howTo: { setup: 'Prepare the reviewed load.', steps: ['Use the reviewed range.'] }, dose: { sets: 2, reps: 6 },
  maxFrequencyPerWeek: 2, coachComments: [], adaptiveLevers: [], status: 'draft' };

beforeEach(() => {
  harness.save.mockReset(); harness.transaction.mockReset(); harness.media.mockReset();
  harness.txUpdate.mockReset(); harness.txSet.mockReset();
  harness.stored = { productionBatchId: 'whole-body-2026-09', catalogVersion: harness.currentVersion };
  harness.save.mockResolvedValue({ data: { catalogVersion: '1.0.9' } });
});

it('does not resolve a quarantined primary demo in the library', async () => {
  await expect(mediaPlaybackUrl({ storagePath: 'retained/video.mp4', status: 'pending' })).resolves.toBeNull();
  expect(harness.media).not.toHaveBeenCalled();
  harness.media.mockResolvedValue('https://synthetic.invalid/demo.mp4');
  await expect(mediaPlaybackUrl({ storagePath: 'retained/video.mp4', status: 'approved' })).resolves.toBe('https://synthetic.invalid/demo.mp4');
});

describe('managed drill content concurrency', () => {
  it('sends the version the editor loaded, even when a newer document is fetched for routing', async () => {
    await expect(updateDrill('STR-501', write, '1.0.3')).resolves.toBe('1.0.9');
    expect(harness.save).toHaveBeenCalledWith({ drillId: 'STR-501', write, expectedCatalogVersion: '1.0.3' });
    expect(harness.transaction).not.toHaveBeenCalled();
  });
  it('requires a loaded version instead of silently treating current data as the edited version', async () => {
    await expect(updateDrill('STR-501', write)).rejects.toThrow('Reload this drill');
    expect(harness.save).not.toHaveBeenCalled();
    expect(harness.transaction).not.toHaveBeenCalled();
  });
  it('surfaces server stale-edit refusals without falling back to a direct catalog write', async () => {
    harness.save.mockRejectedValue(new Error('This drill changed. Reload before saving.'));
    await expect(updateDrill('STR-501', write, '1.0.3')).rejects.toThrow('This drill changed');
    expect(harness.transaction).not.toHaveBeenCalled();
  });
});

// Database-first catalog contract §3.1 / §3.4: what a direct (non-batch) admin save may and may not do.
describe('direct admin save against database-first catalog documents', () => {
  const loadedAt = { seconds: 1_800_000_000, nanoseconds: 5 };
  const libraryDoc = (extra: Record<string, unknown> = {}) => ({
    schemaVersion: 2, drillId: 'GYM-001', name: 'Goblet squat', domain: 'strength', status: 'draft',
    catalogVersion: '1.0.5', updatedAt: loadedAt, equipment: ['dumbbells', 'bench', 'mat'],
    dose: { setsMin: 3, repsMin: 8, intervalSecondsMin: 20, intervalSecondsMax: 40, doseNote: 'keep tempo slow' },
    howTo: { setup: 'old', steps: ['old step'], videoCue: 'keep chest tall' },
    pools: { gym: { category: 'squat', secondary: [] } }, cameraView: 'Side', familyId: 'squat-family',
    profileVersion: 'core-movement-2', minimumClient: { build: 40 },
    validation: { required: true, result: 'pending' },
    ...extra,
  });
  const transactionOver = () => harness.transaction.mockImplementation(async (run: (tx: unknown) => Promise<string>) => run({
    get: async (ref: { id: string }) => ({ exists: true, data: () => (ref.id === 'current' ? { catalogVersion: '1.0.8' } : harness.stored) }),
    update: harness.txUpdate, set: harness.txSet,
  }));
  const save = (overrides: Partial<DrillWrite> = {}) => updateDrill('GYM-001', { ...write, ...overrides }, '1.0.5', loadedAt);
  beforeEach(() => { harness.stored = libraryDoc(); transactionOver(); });

  it('writes schemaVersion 2 and an explicit status, and bumps the catalog version', async () => {
    await expect(save()).resolves.toBe('1.0.9');
    const [, payload] = harness.txUpdate.mock.calls[0];
    expect(payload).toMatchObject({ schemaVersion: 2, status: 'draft', catalogVersion: '1.0.9', updatedBy: 'admin-test' });
  });

  it('touches only its fixed key set, so additive top-level fields survive and validation is never written', async () => {
    await save();
    const [, payload] = harness.txUpdate.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual([
      'adaptiveLevers', 'catalogVersion', 'coachComments', 'coachCommentsSource', 'difficultyLevel', 'dose', 'domain',
      'drillId', 'equipment', 'howTo', 'howToSource', 'maxAge', 'maxFrequencyPerWeek', 'minAge', 'name',
      'positionSpecific', 'requiresPartner', 'schemaVersion', 'status', 'updatedAt', 'updatedBy',
    ].sort());
    for (const key of ['validation', 'pools', 'cameraView', 'familyId', 'profileVersion', 'minimumClient']) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('never writes validation, even if a caller smuggles one into the write', async () => {
    await save({ validation: { required: false, result: 'pass' } } as unknown as Partial<DrillWrite>);
    expect(harness.txUpdate.mock.calls[0][1]).not.toHaveProperty('validation');
  });

  it('preserves unknown dose and howTo sub-keys while the form fields win', async () => {
    await save({ dose: { setsMin: 4, repsMin: 6 }, howTo: { setup: 'new', steps: ['new step'] } });
    const [, payload] = harness.txUpdate.mock.calls[0];
    expect(payload.dose).toEqual({
      setsMin: 4, repsMin: 6, intervalSecondsMin: 20, intervalSecondsMax: 40, doseNote: 'keep tempo slow',
    });
    expect(payload.howTo).toEqual({ setup: 'new', steps: ['new step'], videoCue: 'keep chest tall' });
  });

  it('keeps the stored equipment order when the set is unchanged', async () => {
    await save({ equipment: ['mat', 'dumbbells', 'bench'] });
    expect(harness.txUpdate.mock.calls[0][1].equipment).toEqual(['dumbbells', 'bench', 'mat']);
  });

  it('refuses a stale form instead of reverting an automatic publish', async () => {
    harness.stored = libraryDoc({ status: 'published', catalogVersion: '1.0.7' });
    await expect(save()).rejects.toThrow(STALE_DRILL_MESSAGE);
    expect(harness.txUpdate).not.toHaveBeenCalled();
    expect(harness.txSet).not.toHaveBeenCalled();
  });

  it('refuses when only updatedAt moved (a clip upload or another edit)', async () => {
    harness.stored = libraryDoc({ updatedAt: { seconds: 1_800_000_100, nanoseconds: 0 } });
    await expect(save()).rejects.toThrow(STALE_DRILL_MESSAGE);
    expect(harness.txUpdate).not.toHaveBeenCalled();
  });

  it('requires the version the form loaded', async () => {
    await expect(updateDrill('GYM-001', write)).rejects.toThrow('Reload this drill');
    expect(harness.txUpdate).not.toHaveBeenCalled();
  });

  it('will not publish a drill whose validation is required and not passed', async () => {
    await expect(save({ status: 'published' })).rejects.toThrow('must pass validation');
    harness.stored = libraryDoc({ validation: { required: true, result: 'fail' } });
    await expect(save({ status: 'published' })).rejects.toThrow('must pass validation');
    expect(harness.txUpdate).not.toHaveBeenCalled();
  });

  it('still saves a blocked drill as a draft or archived, and publishes after a pass or for an exempt drill', async () => {
    await expect(save({ status: 'archived' })).resolves.toBe('1.0.9');
    harness.stored = libraryDoc({ validation: { required: true, result: 'pass' } });
    await expect(save({ status: 'published' })).resolves.toBe('1.0.9');
    harness.stored = libraryDoc({ validation: { required: false, exemptReason: 'published-before-gate-2026-11-07' } });
    await expect(save({ status: 'published' })).resolves.toBe('1.0.9');
    harness.stored = libraryDoc({ validation: undefined });
    await expect(save({ status: 'published' })).resolves.toBe('1.0.9');
  });

  it('refuses a v1 document', async () => {
    harness.stored = libraryDoc({ schemaVersion: 1 });
    await expect(save()).rejects.toThrow('not been migrated');
  });
});

describe('save helpers', () => {
  it('keeps stored order for an unchanged set, drops removed items and appends new ones', () => {
    expect(keepEquipmentOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
    expect(keepEquipmentOrder(['a', 'b', 'c'], ['c', 'a'])).toEqual(['a', 'c']);
    expect(keepEquipmentOrder(['a', 'b'], ['z', 'b'])).toEqual(['b', 'z']);
    expect(keepEquipmentOrder(undefined, ['x', 'y'])).toEqual(['x', 'y']);
  });
  it('compares timestamps by value and treats absent as equal to absent', () => {
    expect(sameStamp({ seconds: 1, nanoseconds: 2 }, { seconds: 1, nanoseconds: 2 })).toBe(true);
    expect(sameStamp({ seconds: 1, nanoseconds: 2 }, { seconds: 1, nanoseconds: 3 })).toBe(false);
    expect(sameStamp(undefined, null)).toBe(true);
    expect(sameStamp(undefined, { seconds: 1, nanoseconds: 0 })).toBe(false);
    expect(sameStamp({ toMillis: () => 5 }, { toMillis: () => 5 })).toBe(true);
  });
});
