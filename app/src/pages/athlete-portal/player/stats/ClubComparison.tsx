import { useEffect, useMemo, useState } from 'react';
import type { Access } from '../../lib/loaders';
import type { Row } from '../execution';
import type { ReportMetric } from '../report';
import ClubCloudChart from './ClubCloudChart';
import { CLUB_STAFF, CLUB_TESTS, GENDER_LABEL, loadClubComparison } from './club-comparison';
import type { ClubComparisonData } from './club-comparison';
import './club-comparison.css';

/**
 * Under the pose player: the club's average and spread for the picked test across age groups, for
 * athletes of this athlete's gender, with this athlete's result(s) on top (ClubCloudChart). Every
 * test loads as soon as this mounts (when the report arrives), so picking another card shows its
 * chart at once. Staff only for now: see club-comparison.ts.
 */
export default function ClubComparison({ metric, access, playerId, athlete }: { metric: ReportMetric; access: Access; playerId: string | null; athlete: Row }) {
  const staff = CLUB_STAFF.has(access);
  const organizationId: string | null = athlete?.organizationId || null, teamId: string | null = athlete?.teamId || null, recorded = athlete?.gender;
  const viewer = useMemo(() => ({ access, playerId, organizationId, teamId, gender: recorded }), [access, playerId, organizationId, teamId, recorded]);
  // Results are kept with the viewer they were loaded for, so another athlete never shows stale ones.
  const [loaded, setLoaded] = useState<{ viewer: object | null; results: Record<string, ClubComparisonData | null | 'error'> }>({ viewer: null, results: {} });
  useEffect(() => {
    if (!staff) return;
    let live = true;
    const keep = (id: string, value: ClubComparisonData | null | 'error') => {
      if (live) setLoaded(current => ({ viewer, results: { ...(current.viewer === viewer ? current.results : {}), [id]: value } }));
    };
    for (const id of Object.keys(CLUB_TESTS)) loadClubComparison(viewer, id).then(result => keep(id, result), () => keep(id, 'error'));
    return () => { live = false; };
  }, [staff, viewer]);

  const test = CLUB_TESTS[metric.id];
  const result = loaded.viewer === viewer ? loaded.results[metric.id] : undefined;
  if (!staff || !test || !playerId || result === null) return null;
  if (result === undefined) return <section className="stats-club" aria-label="Club comparison" aria-busy="true">
    <p className="stats-loading" role="status"><span className="stats-spinner" aria-hidden="true" />Loading club comparison</p>
  </section>;
  if (result === 'error') return <section className="stats-club" aria-label="Club comparison"><p className="club-cloud-empty">The club comparison could not be loaded.</p></section>;

  const title = `${result.organizationName} · ${result.gender ? GENDER_LABEL[result.gender] : 'Everyone'}`;
  const { stats } = result;
  if (!stats.athletes) return <section className="stats-club" aria-label="Club comparison">
    <h3>{title}</h3><p className="club-cloud-empty">No club results for this test yet.</p>
  </section>;
  const context = [`${stats.athletes} ${stats.athletes === 1 ? 'player' : 'players'}`, !stats.higherIsBetter && 'lower is better',
    !result.gender && 'no gender recorded, so everyone is shown', result.teamsOnly && 'your teams only', result.incomplete && 'some results could not be read']
    .filter((part): part is string => Boolean(part));
  return <ClubCloudChart key={metric.id} stats={stats} title={title} context={context} digits={test.display.digits} />;
}
