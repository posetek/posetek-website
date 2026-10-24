import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  uid: 'synthetic-workout-owner', allocated: 0, storage: new Map<string, string>(), documents: new Map<string, any>(),
  results: {} as Record<string, any>, set: vi.fn(), get: vi.fn(), stop: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: (initial: any) => ({ current: initial }), useEffect: () => {},
}));
vi.mock('../../../lib/firebase', () => {
  const collection = (path: string): any => ({ doc: (provided?: string) => {
    const id = provided || `syntheticJob${String(++harness.allocated).padStart(4, '0')}`, documentPath = `${path}/${id}`;
    return { id, collection: (name: string) => collection(`${documentPath}/${name}`),
      set: (value: any) => harness.set(documentPath, value), get: () => harness.get(documentPath),
      onSnapshot: (next: (snapshot: any) => void) => {
        let active = true;
        // Firestore invokes snapshot listeners asynchronously, after unsubscribe exists.
        void Promise.resolve().then(() => { if (active) next({ data: () => harness.documents.get(documentPath) }); });
        return () => { active = false; harness.stop(documentPath); };
      },
    };
  } });
  return { default: { firestore: { FieldValue: { serverTimestamp: () => 'server-timestamp' } } },
    auth: { get currentUser() { return { uid: harness.uid }; } }, db: { collection } };
});
import { PERSONAL_CAPABILITIES, personalJobKey } from './personal-workouts';
import { usePersonalWorkouts } from './use-personal-workouts';

const playerId = 'synthetic-player';
const config = { globalEnabled: true, personalWorkoutsEnabled: true,
  capabilities: Object.fromEntries(PERSONAL_CAPABILITIES.map(capability => [capability, { enabled: true, dailyLimitPerUser: 5 }])) };
const params = { scheduledDate: '2026-10-24', timezone: 'UTC', timeAvailableMinutes: 20, requestText: 'Create a strength session.',
  intake: { age: 15, equipment: ['timer'], setting: 'solo', painFlag: false, focusDomains: ['strength'],
    access: { schemaVersion: 1, facility: 'home', participantCount: 1, confirmed: true, space: { assumedSufficient: true } } } };
const workout = { schemaVersion: 1, source: 'personal', playerId, workoutId: 'synthetic-workout', revision: 1,
  title: 'Saved strength workout', blocks: [], estimatedMinutes: 20 };
const assessment = { schemaVersion: 1, supportedMinutes: [20], scheduleRevision: 0 };
const log = { schemaVersion: 1, source: 'personal', workoutId: workout.workoutId, workoutRevision: 1,
  workoutSnapshot: workout, revision: 1, elapsedSeconds: 0, endedAt: null, blocks: [] };
const offKey = () => `posetek:ai-sharing-off:v1:${harness.uid}`;

beforeEach(() => {
  harness.uid = 'synthetic-workout-owner'; harness.allocated = 0; harness.storage.clear(); harness.documents.clear();
  harness.set.mockReset(); harness.get.mockReset(); harness.stop.mockReset();
  harness.results = {
    assess_personal_workout: assessment,
    save_personal_workout: { workoutId: workout.workoutId, workout, revision: 1, scheduleRevision: 1 },
    start_personal_workout: { log },
  };
  harness.set.mockImplementation(async (path: string, value: any) => {
    harness.documents.set(path, { ...value, status: 'complete', result: harness.results[value.capability] || {} });
  });
  harness.get.mockImplementation(async (path: string) => ({ exists: harness.documents.has(path), data: () => harness.documents.get(path) }));
  vi.stubGlobal('localStorage', { getItem: (key: string) => harness.storage.get(key) ?? null,
    setItem: (key: string, value: string) => harness.storage.set(key, value), removeItem: (key: string) => harness.storage.delete(key) });
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  harness.storage.set(offKey(), 'true');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('personal workout jobs while local AI sharing is off', () => {
  it('rejects a new generation before the Firestore job write and leaves no accepted request to recover', async () => {
    await expect(usePersonalWorkouts(playerId, false, config).generate(params)).rejects.toMatchObject({ code: 'ai_consent_required' });
    expect(harness.set).not.toHaveBeenCalled();
    expect(harness.documents.size).toBe(0);
    const pending = JSON.parse(harness.storage.get(personalJobKey(harness.uid, playerId))!);
    expect(pending).toMatchObject({ capability: 'generate_personal_workout', terminalFailed: true });
    expect(harness.storage.get(offKey())).toBe('true');
  });

  it('allows a deterministic setup assessment to finish without changing the sharing preference', async () => {
    await expect(usePersonalWorkouts(playerId, false, config).assess(params)).resolves.toEqual(assessment);
    expect(harness.set).toHaveBeenCalledTimes(1);
    expect(harness.set.mock.calls[0]).toEqual([expect.stringMatching(/^llmJobs\//), expect.objectContaining({ capability: 'assess_personal_workout' })]);
    expect(harness.storage.get(offKey())).toBe('true');
  });

  it('allows a deterministic reviewed-workout save to finish without changing the sharing preference', async () => {
    const saved = harness.results.save_personal_workout;
    await expect(usePersonalWorkouts(playerId, false, config).save({ ...params, workout })).resolves.toMatchObject(saved);
    expect(harness.set).toHaveBeenCalledTimes(1);
    expect(harness.set.mock.calls[0][1]).toMatchObject({ capability: 'save_personal_workout', params: { workout } });
    expect(harness.storage.get(offKey())).toBe('true');
  });

  it('allows a deterministic saved-workout start after the existing setup confirmation', async () => {
    await expect(usePersonalWorkouts(playerId, false, config).start(workout, {
      equipmentConfirmed: true, painFlag: false, currentAccess: params.intake,
    })).resolves.toMatchObject({ workoutId: workout.workoutId, source: 'personal', timerStartedHere: true });
    expect(harness.set).toHaveBeenCalledTimes(1);
    expect(harness.set.mock.calls[0][1]).toMatchObject({ capability: 'start_personal_workout', params: { workoutId: workout.workoutId, equipmentConfirmed: true, painFlag: false } });
    expect(harness.storage.get(offKey())).toBe('true');
  });

  it('recovers an already accepted generation without submitting another job while sharing is off', async () => {
    const jobId = 'acceptedSyntheticJob', requestId = 'accepted-request', result = { schemaVersion: 1, acceptedBeforeWithdrawal: true };
    harness.documents.set(`llmJobs/${jobId}`, { playerId, requestedByUid: harness.uid, capability: 'generate_personal_workout',
      params: { ...params, requestId }, status: 'complete', result });
    harness.storage.set(personalJobKey(harness.uid, playerId), JSON.stringify({ schemaVersion: 1, uid: harness.uid, playerId,
      jobId, capability: 'generate_personal_workout', params: { ...params, requestId },
      signature: JSON.stringify({ capability: 'generate_personal_workout', params }) }));
    await expect(usePersonalWorkouts(playerId, false, config).generate(params)).resolves.toEqual(result);
    expect(harness.set).not.toHaveBeenCalled();
    expect(harness.documents.size).toBe(1);
    expect(harness.storage.has(personalJobKey(harness.uid, playerId))).toBe(false);
    expect(harness.storage.get(offKey())).toBe('true');
  });
});
