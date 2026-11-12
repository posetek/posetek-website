import { useEffect, useState } from 'react';
import { db } from '../../../../lib/firebase';
import type { Row } from '../execution';
import { personalExecutionId } from '../personal-workouts';
import { previewHistory } from './hub';

/**
 * Every workout log of the athlete, read only while `enabled` (the page that shows it is on
 * screen). The last copy stays for the next visit and refreshes when the listener reopens.
 * Workout History and the training totals on Stats both read through here.
 */
export function useAllWorkoutLogs(playerId: string | null | undefined, preview: boolean, enabled: boolean) {
  const [logs, setLogs] = useState<Row[]>(() => preview ? previewHistory() : []);
  const [loaded, setLoaded] = useState(preview), [error, setError] = useState('');
  const listening = !preview && enabled && !!playerId;
  useEffect(() => {
    if (!listening) return;
    return db.collection('players').doc(playerId!).collection('workoutLogs').onSnapshot(
      s => { setLogs(s.docs.map(d => ({ ...d.data(), id: d.id }))); setLoaded(true); setError(''); },
      e => { setLoaded(true); setError(e.message); });
  }, [playerId, listening]);
  return { logs, loaded, error };
}

/**
 * One list with each workout once: every saved log, then the hub's own copies (newer in a
 * preview), then personal sessions under their execution id.
 */
export function allWorkoutLogs(saved: Row[], current: Row[], personalLogs: Record<string, Row>): Row[] {
  const byId = new Map<string, Row>();
  for (const log of [...saved, ...current]) byId.set(String(log.id), log);
  for (const [workoutId, log] of Object.entries(personalLogs)) byId.set(personalExecutionId(workoutId), { ...log, id: personalExecutionId(workoutId), workoutId, source: 'personal' });
  return [...byId.values()];
}
