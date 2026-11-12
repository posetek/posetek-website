// The yoga pose status-only write. Yoga library data contract v1 §1, §4, §5.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeYogaPose } from '../../../lib/contracts/yogaLibrary';
import { STALE_YOGA_MESSAGE, updateYogaPoseStatus, yogaLastChange } from './yogaLibrary';

const harness = vi.hoisted(() => ({
  transaction: vi.fn(), txUpdate: vi.fn(), txSet: vi.fn(), refs: [] as { collection: string; id: string }[],
  stored: {} as Record<string, unknown> | null, meta: {} as Record<string, unknown> | null,
}));
vi.mock('../../../lib/firebase', () => ({
  default: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } } },
  auth: { currentUser: { uid: 'admin-test' } }, storage: {}, cloud: {},
  db: {
    collection: (collection: string) => ({ doc: (id: string) => ({ id, collection }) }),
    runTransaction: harness.transaction,
  },
}));

const loadedAt = { seconds: 1_794_000_000, nanoseconds: 7 };
const poseDoc = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1, drillId: 'athlete_boat', name: 'Boat', domain: 'yoga', status: 'published',
  catalogVersion: '1.0.4', updatedAt: loadedAt, updatedBy: 'system:generator', familyId: 'boat',
  equipment: ['mat'], howTo: { setup: 'Sit.', steps: ['Lean back.'] },
  validation: { required: false, exemptReason: 'yoga-published-before-gate-2026-11-07' },
  unknownTopLevel: { keep: true },
  yoga: { poseId: 'boat', contentRevision: 'r1', posture: 'seated', unknownYogaKey: 1 },
  ...extra,
});

beforeEach(() => {
  harness.transaction.mockReset(); harness.txUpdate.mockReset(); harness.txSet.mockReset();
  harness.refs = [];
  harness.stored = poseDoc();
  harness.meta = { catalogVersion: '1.0.7' };
  harness.transaction.mockImplementation(async (run: (tx: unknown) => Promise<string>) => run({
    get: async (ref: { collection: string; id: string }) => {
      harness.refs.push(ref);
      const data = ref.collection === 'drillCatalogMeta' ? harness.meta : harness.stored;
      return { exists: data !== null, data: () => data ?? undefined };
    },
    update: harness.txUpdate, set: harness.txSet,
  }));
});

const loaded = (extra: Record<string, unknown> = {}) => normalizeYogaPose('athlete_boat', poseDoc(extra));

describe('yoga pose status-only write', () => {
  it('writes exactly status, catalogVersion, updatedAt and updatedBy on the pose', async () => {
    await expect(updateYogaPoseStatus(loaded(), 'archived')).resolves.toBe('1.0.8');
    expect(harness.txUpdate).toHaveBeenCalledTimes(1);
    const [ref, payload] = harness.txUpdate.mock.calls[0];
    expect(ref).toEqual({ collection: 'yogaLibrary', id: 'athlete_boat' });
    expect(payload).toEqual({ status: 'archived', catalogVersion: '1.0.8', updatedAt: 'SERVER_TIMESTAMP', updatedBy: 'admin-test' });
    // Unknown keys survive by construction: they are never sent.
    for (const key of ['unknownTopLevel', 'yoga', 'validation', 'howTo', 'equipment', 'schemaVersion', 'createdAt']) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('bumps drillCatalogMeta/yogaLibrary, never drillCatalogMeta/current, with a string lastChange', async () => {
    await updateYogaPoseStatus(loaded(), 'archived');
    expect(harness.refs).toContainEqual({ collection: 'drillCatalogMeta', id: 'yogaLibrary' });
    expect(harness.refs).not.toContainEqual({ collection: 'drillCatalogMeta', id: 'current' });
    expect(harness.txSet).toHaveBeenCalledTimes(1);
    const [ref, meta, options] = harness.txSet.mock.calls[0];
    expect(ref).toEqual({ collection: 'drillCatalogMeta', id: 'yogaLibrary' });
    expect(meta).toEqual({
      catalogVersion: '1.0.8', updatedAt: 'SERVER_TIMESTAMP', updatedBy: 'admin-test',
      lastChange: 'athlete_boat: status archived',
    });
    expect(typeof meta.lastChange).toBe('string');
    expect(options).toEqual({ merge: true });
    expect(yogaLastChange('athlete_boat', 'draft')).toBe('athlete_boat: status draft');
  });

  it('starts the version at 1.0.0 when the version document is absent, so the first write is 1.0.1', async () => {
    harness.meta = null;
    await expect(updateYogaPoseStatus(loaded(), 'archived')).resolves.toBe('1.0.1');
    expect(harness.txUpdate.mock.calls[0][1].catalogVersion).toBe('1.0.1');
    expect(harness.txSet.mock.calls[0][1].catalogVersion).toBe('1.0.1');
  });

  it('refuses when the status moved since the list loaded', async () => {
    harness.stored = poseDoc({ status: 'archived' });
    await expect(updateYogaPoseStatus(loaded(), 'draft')).rejects.toThrow(STALE_YOGA_MESSAGE);
    expect(harness.txUpdate).not.toHaveBeenCalled();
    expect(harness.txSet).not.toHaveBeenCalled();
  });

  it('refuses when the catalogVersion moved', async () => {
    harness.stored = poseDoc({ catalogVersion: '1.0.5' });
    await expect(updateYogaPoseStatus(loaded(), 'archived')).rejects.toThrow(STALE_YOGA_MESSAGE);
    expect(harness.txUpdate).not.toHaveBeenCalled();
  });

  it('refuses when only updatedAt moved', async () => {
    harness.stored = poseDoc({ updatedAt: { seconds: 1_794_000_001, nanoseconds: 0 } });
    await expect(updateYogaPoseStatus(loaded(), 'archived')).rejects.toThrow(STALE_YOGA_MESSAGE);
    expect(harness.txUpdate).not.toHaveBeenCalled();
  });

  it('gives a document with no status an explicit one, and treats a status that appeared meanwhile as stale', async () => {
    harness.stored = poseDoc({ status: undefined });
    const unset = loaded({ status: undefined });
    expect(unset.status).toBeNull();
    await expect(updateYogaPoseStatus(unset, 'published')).resolves.toBe('1.0.8');
    expect(harness.txUpdate.mock.calls[0][1].status).toBe('published');
    harness.txUpdate.mockReset();
    harness.stored = poseDoc({ status: 'published' });
    await expect(updateYogaPoseStatus(unset, 'archived')).rejects.toThrow(STALE_YOGA_MESSAGE);
    expect(harness.txUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing for an unchanged status and returns the library version', async () => {
    await expect(updateYogaPoseStatus(loaded(), 'published')).resolves.toBe('1.0.7');
    expect(harness.txUpdate).not.toHaveBeenCalled();
    expect(harness.txSet).not.toHaveBeenCalled();
  });

  it('archives and restores the same pose (the acceptance example)', async () => {
    await expect(updateYogaPoseStatus(loaded(), 'archived')).resolves.toBe('1.0.8');
    harness.stored = poseDoc({ status: 'archived', catalogVersion: '1.0.8', updatedAt: { seconds: 1_794_000_100, nanoseconds: 0 } });
    harness.meta = { catalogVersion: '1.0.8' };
    const archived = normalizeYogaPose('athlete_boat', harness.stored);
    await expect(updateYogaPoseStatus(archived, 'published')).resolves.toBe('1.0.9');
    expect(harness.txUpdate.mock.calls.map(call => call[1].status)).toEqual(['archived', 'published']);
  });

  it('keeps the shared validation publish gate (yoga is exempt by default)', async () => {
    harness.stored = poseDoc({ status: 'draft', validation: { required: true, result: 'pending' } });
    await expect(updateYogaPoseStatus(loaded({ status: 'draft', validation: { required: true, result: 'pending' } }), 'published'))
      .rejects.toThrow('must pass validation');
    expect(harness.txUpdate).not.toHaveBeenCalled();
    harness.stored = poseDoc({ status: 'draft' });
    await expect(updateYogaPoseStatus(loaded({ status: 'draft' }), 'published')).resolves.toBe('1.0.8');
  });

  it('refuses a document that is not yoga library schema 1, and a deleted one', async () => {
    harness.stored = poseDoc({ schemaVersion: 2 });
    await expect(updateYogaPoseStatus(loaded({ schemaVersion: 2 }), 'archived')).rejects.toThrow('not a yoga library v1 document');
    harness.stored = null;
    await expect(updateYogaPoseStatus(loaded(), 'archived')).rejects.toThrow('no longer exists');
    expect(harness.txUpdate).not.toHaveBeenCalled();
  });
});
