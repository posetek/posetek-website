import { useEffect, useState } from 'react';
import { db } from '../../../../lib/firebase';
import type { Row } from '../execution';
import { activeTrainingPlan, catalogEntry, practiceCandidateIds } from './report-practice';
import type { PracticeCatalogEntry } from './report-practice';

/**
 * The preview's active plan, reduced to what the samples read. It names the same two drills as
 * the workout hub's sample plan (`previewProgram` in PlayerTraining.tsx), which is kept out of this
 * import graph while the Workouts slice is rewritten.
 */
export function previewPracticePlan(playerId: string): Row {
  const blocks = [{ blockId: 'b1', order: 1, drillId: 'DRB-005', name: 'Cone maze', sets: 3, reps: 60 }, { blockId: 'b2', order: 2, drillId: 'PAS-001', name: 'Wall pass rhythm', sets: 3, reps: 60 }];
  return { id: 'preview-plan', playerId, schemaVersion: 3, status: 'active', startDate: new Date().toLocaleDateString('en-CA'),
    weeks: [1, 2].map(weekNumber => ({ weekNumber, workouts: [1, 2].map(order => ({ workoutId: `w${weekNumber}s${order}`, order, blocks })) })) };
}

export type ReportPracticeState = { plan: Row | null; catalog: PracticeCatalogEntry[]; loading: boolean; error: string | null };

/**
 * The athlete's active saved plan and the catalog rows its drills need, read the way the app's
 * `AthleteTestReportSection` does (`TrainingPlanStore` active plan, `DrillCatalogStore`). The
 * plan list is the same `trainingPlans` listener the workout hub uses; each catalog row is one
 * `drillCatalog/{id}` read, as `DrillMedia` does. The preview uses the workout hub's sample plan.
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
  const key = ids.join('|');
  useEffect(() => {
    if (!ids.length) { setCatalog({ ids: key, entries: [] }); return; }
    if (preview) { setCatalog({ ids: key, entries: ids.map(id => ({ drillId: id, published: true, technicalTransfer: '' })) }); return; }
    let alive = true;
    void Promise.all(ids.map(id => db.collection('drillCatalog').doc(id).get()
      .then(doc => doc.exists ? [catalogEntry(doc.id, doc.data())] : [])
      .catch(() => [] as PracticeCatalogEntry[])))
      .then(rows => { if (alive) setCatalog({ ids: key, entries: rows.flat() }); });
    return () => { alive = false; };
    // `key` carries the ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, preview]);
  return { plan, catalog: catalog?.ids === key ? catalog.entries : [], loading: plans === null || (!error && catalog?.ids !== key), error };
}
