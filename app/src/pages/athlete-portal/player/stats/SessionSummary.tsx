import { useEffect, useState } from 'react';
import { db } from '../../../../lib/firebase';
import type { Row } from '../execution';
import { parseSession, sessionTiles } from './stats-format';
import type { SessionSummary as Session } from './stats-format';

/** Preview sessions: one per recorded test session in the sample reps. */
export function previewSessions(reps: Record<string, Row[]>): Session[] {
  const sessions = new Map<string, Session>();
  for (const rep of Object.values(reps).flat()) {
    const key = `${rep.repType}:${rep.sessionNumber}`, at = new Date(rep.createdAtMillis || 0), existing = sessions.get(key);
    if (existing) { existing.repCount += 1; if (existing.date && at > existing.date) existing.date = at; }
    else sessions.set(key, { id: key, type: String(rep.repType || ''), repCount: 1, date: rep.createdAtMillis ? at : null });
  }
  return [...sessions.values()].filter(session => session.type);
}

/**
 * The athlete's recorded sessions (`players/{id}/sessions`), read once when Stats opens, as the
 * app's `CoachProfileSessionStatsStore` does. Null while loading; a failed read shows the empty totals.
 */
export function useRecordedSessions(playerId: string | null, preview: boolean, reps: Record<string, Row[]>): Session[] | null {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  useEffect(() => {
    setSessions(null);
    if (!playerId) { setSessions([]); return; }
    if (preview) { setSessions(previewSessions(reps)); return; }
    let alive = true;
    db.collection('players').doc(playerId).collection('sessions').get()
      .then(snapshot => { if (alive) setSessions(snapshot.docs.flatMap(doc => { const session = parseSession(doc.id, doc.data()); return session ? [session] : []; })); })
      .catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
    // Preview reps are fixed sample data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, preview]);
  return sessions;
}

/** Streak, Total Sessions and Favorite Drill (`V4MetricTile` x3), under the body scan. */
export default function SessionSummary({ sessions }: { sessions: Session[] | null }) {
  const tiles = sessionTiles(sessions);
  const tile = (title: string, value: string, caption: string | null, icon: string) => <div className="stats-tile">
    <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
    {/* The app shrinks a long value to fit the tile instead of breaking the word. */}
    <small>{title}</small><strong className={value.length > 7 ? 'stats-tile-long' : undefined}>{value}</strong>{caption && <small>{caption}</small>}
  </div>;
  return <div className="stats-tiles">
    {tile('Streak', tiles.streak, 'Keep it going', 'local_fire_department')}
    {tile('Total Sessions', tiles.total, 'All time', 'calendar_month')}
    {tile('Favorite Drill', tiles.favorite, tiles.favoriteCaption, 'star')}
  </div>;
}
