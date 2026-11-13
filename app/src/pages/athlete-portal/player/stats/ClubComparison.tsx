import { useEffect, useMemo, useRef, useState } from 'react';
import type { Access } from '../../lib/loaders';
import type { Row } from '../execution';
import type { ReportMetric } from '../report';
import ClubCloudChart from './ClubCloudChart';
import { CLUB_STAFF, CLUB_TESTS, GENDER_LABEL, watchClubComparison } from './club-comparison';
import type { ClubComparisonData } from './club-comparison';
import './club-comparison.css';

/**
 * Under the pose player: the club's average and spread for the picked test across age groups, for
 * athletes of this athlete's gender, with this athlete's result(s) on top (ClubCloudChart). Every
 * test loads as soon as this mounts (when the report arrives; PlayerStats starts the reads when the
 * page opens), so picking another card shows its chart at once. The club's statistics kept from an
 * earlier visit show at once and are refreshed behind them. Any signed-in viewer when the club's
 * statistics document holds the test; otherwise staff only (see club-comparison.ts). A player sees
 * nothing until the document answers, so a club without one shows no empty section.
 */
export default function ClubComparison({ metric, access, playerId, athlete, reps }: { metric: ReportMetric; access: Access; playerId: string | null; athlete: Row; reps: Record<string, Row[]> }) {
  const staff = CLUB_STAFF.has(access);
  const organizationId: string | null = athlete?.organizationId || null, teamId: string | null = athlete?.teamId || null, recorded = athlete?.gender;
  const viewer = useMemo(() => ({ access, playerId, organizationId, teamId, gender: recorded }), [access, playerId, organizationId, teamId, recorded]);
  // The athlete's effective results the page already holds, read when the athlete's own dot is drawn.
  const ownReps = useRef(reps);
  useEffect(() => { ownReps.current = reps; }, [reps]);
  // Results are kept with the viewer they were loaded for, so another athlete never shows stale ones.
  const [loaded, setLoaded] = useState<{ viewer: object | null; results: Record<string, ClubComparisonData | null | 'error'> }>({ viewer: null, results: {} });
  useEffect(() => {
    let live = true;
    const keep = (id: string, value: ClubComparisonData | null | 'error') => {
      if (live) setLoaded(current => ({ viewer, results: { ...(current.viewer === viewer ? current.results : {}), [id]: value } }));
    };
    const own = () => Object.values(ownReps.current || {}).flat();
    for (const id of Object.keys(CLUB_TESTS)) watchClubComparison(viewer, id, own, result => keep(id, result)).catch(() => keep(id, 'error'));
    return () => { live = false; };
  }, [viewer]);

  const test = CLUB_TESTS[metric.id];
  const result = loaded.viewer === viewer ? loaded.results[metric.id] : undefined;
  if (!test || !playerId || result === null || (!staff && result === undefined)) return null;
  if (result === undefined) return <section className="stats-club" aria-label="Club comparison" aria-busy="true">
    <p className="stats-loading" role="status"><span className="stats-spinner" aria-hidden="true" />Loading club comparison</p>
  </section>;
  if (result === 'error') return <section className="stats-club" aria-label="Club comparison"><p className="club-cloud-empty">The club comparison could not be loaded.</p></section>;

  const title = `${result.organizationName} · ${result.gender ? GENDER_LABEL[result.gender] : 'Everyone'}`;
  const { stats } = result;
  if (!stats.athletes) return <section className="stats-club" aria-label="Club comparison">
    <h3>{title}</h3><p className="club-cloud-empty">No club results for this test yet.</p>
  </section>;
  const context = [result.measureLabel, `${stats.athletes} ${stats.athletes === 1 ? 'player' : 'players'}`, !stats.higherIsBetter && 'lower is better',
    !result.gender && 'no gender recorded, so everyone is shown', result.teamsOnly && 'your teams only', result.incomplete && 'some results could not be read']
    .filter((part): part is string => Boolean(part));
  return <ClubCloudChart key={metric.id} stats={stats} title={title} context={context} digits={(result.display ?? test.display).digits} />;
}
