import { useEffect, useState } from 'react';
import { db } from '../../../../lib/firebase';
import type { Row } from '../execution';
import { activeTrainingPlan, catalogEntry, practiceCandidateIds, readPracticeCatalog } from './report-practice';
import type { PracticeCatalogEntry } from './report-practice';

/**
 * The preview's active plan, reduced to what the samples read. It names the same two drills as
 * the workout hub's sample plan (`previewProgram` in PlayerTraining.tsx), which is kept out of this
 * import graph while the Workouts slice is rewritten.
 */
export function previewPracticePlan(playerId: string): Row {
  const dose = { kind: 'main', sets: 3, reps: 60, repUnit: 'seconds', restSeconds: 30, restScope: 'sets' };
  const blocks = [{ ...dose, blockId: 'b1', order: 1, drillId: 'DRB-005', name: 'Cone maze', domain: 'dribbling', estimatedMinutes: 14 },
    { ...dose, blockId: 'b2', order: 2, drillId: 'PAS-001', name: 'Wall pass rhythm', domain: 'passing', estimatedMinutes: 12 }];
  return { id: 'preview-plan', playerId, schemaVersion: 3, status: 'active', startDate: new Date().toLocaleDateString('en-CA'),
    weeks: [1, 2].map(weekNumber => ({ weekNumber, workouts: [1, 2].map(order => ({ workoutId: `w${weekNumber}s${order}`, order, blocks })) })) };
}

/**
 * The preview's catalog rows for those drills: the same names, focus, equipment and sample how-to
 * the workout setup's preview catalog uses (`sampleCatalog` in use-personal-workouts.ts).
 */
const PREVIEW_CATALOG: Record<string, Row> = {
  'DRB-005': { name: 'Cone maze', domain: 'dribbling', equipment: ['ball', 'cones'] },
  'PAS-001': { name: 'Wall pass rhythm', domain: 'passing', equipment: ['ball', 'wall'] },
};
export function previewCatalogEntry(id: string): PracticeCatalogEntry | null {
  const row = PREVIEW_CATALOG[id];
  return row ? catalogEntry(id, { ...row, schemaVersion: 2, status: 'published', howTo: { setup: 'Use an open, safe space.', steps: ['Keep each repetition controlled.'] } }) : null;
}

export type ReportPracticeState = { plan: Row | null; catalog: PracticeCatalogEntry[]; loading: boolean; error: string | null };

/**
 * The athlete's active saved plan and the catalog rows its drills need, read the way the app's
 * `AthleteTestReportSection` does (`TrainingPlanStore` active plan, `DrillCatalogStore`). The
 * plan list is the same `trainingPlans` listener the workout hub uses; each catalog row is one
 * `drillCatalog/{id}` read, as `DrillMedia` does, and only the rows the two shown drills need are
 * read. The preview uses the workout hub's sample plan.
 */
export function useReportPractice(playerId: string | null, preview: boolean): ReportPracticeState {
  const [plans, setPlans] = useState<Row[] | null>(null), [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{ ids: string; entries: PracticeCatalogEntry[] } | null>(null);
  useEffect(() => {
    setPlans(null); setError(null); setCatalog(null);
    if (!playerId) { setPlans([]); return; }
    if (preview) { setPlans([previewPracticePlan(playerId)]); return; }
    return db.collection('players').doc(playerId).collection('trainingPlans').onSnapshot(
      snapshot => { setPlans(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))); setError(null); },
      failure => { setPlans([]); setError(failure.message || 'Your saved plan could not be loaded.'); },
    );
  }, [playerId, preview]);
  const plan = plans ? activeTrainingPlan(plans) : null;
  const ids = plan && playerId ? practiceCandidateIds(plan, playerId) : [];
  // The athlete is part of the key so a new athlete with the same drills is read again.
  const key = `${playerId}:${ids.join('|')}`;
  useEffect(() => {
    if (!ids.length || !plan || !playerId) { setCatalog({ ids: key, entries: [] }); return; }
    let alive = true;
    // Only as many `drillCatalog/{id}` reads as the two shown drills need (see readPracticeCatalog).
    const read = preview
      ? (id: string) => Promise.resolve(previewCatalogEntry(id))
      : (id: string) => db.collection('drillCatalog').doc(id).get().then(doc => doc.exists ? catalogEntry(doc.id, doc.data()) : null);
    void readPracticeCatalog(plan, playerId, read)
      .then(entries => { if (alive) setCatalog({ ids: key, entries }); });
    return () => { alive = false; };
    // `key` carries the plan's candidate drills; the plan object changes on every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, preview]);
  return { plan, catalog: catalog?.ids === key ? catalog.entries : [], loading: plans === null || (!error && catalog?.ids !== key), error };
}
