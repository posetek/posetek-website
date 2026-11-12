import { useEffect, useMemo, useState } from 'react';
import AgeCurve from '../../../admin/views/AgeCurve';
import type { AgeCurveData, AgeCurveView } from '../../../admin/views/AgeCurve';
import { percentileAmong } from '../../../admin/lib/ageCurve';
import { ageJitter } from '../../../admin/lib/workspaceTesting';
import type { Access } from '../../lib/loaders';
import type { Row } from '../execution';
import type { ReportMetric } from '../report';
import { CLUB_STAFF, CLUB_TESTS, GENDER_LABEL, loadClubTest, plotInputs } from './club-comparison';
import type { ClubTestResult } from './club-comparison';
import './club-comparison.css';

const OTHERS = '#c9d6cf';
const ACCENT = '#7cff18';

/**
 * Under the pose player: every athlete of this athlete's club and gender for the picked test, one
 * best result each, on the organization age curve the admin pages already draw. Only this athlete's
 * point is green and labelled. Every test loads as soon as this mounts (when the report arrives), so
 * picking another card shows its plot at once. Staff only for now: see club-comparison.ts.
 */
export default function ClubComparison({ metric, access, playerId, athlete }: { metric: ReportMetric; access: Access; playerId: string | null; athlete: Row }) {
  const staff = CLUB_STAFF.has(access);
  const organizationId: string | null = athlete?.organizationId || null, teamId: string | null = athlete?.teamId || null, recorded = athlete?.gender;
  const viewer = useMemo(() => ({ access, playerId, organizationId, teamId, gender: recorded }), [access, playerId, organizationId, teamId, recorded]);
  // Results are kept with the viewer they were loaded for, so another athlete never shows stale ones.
  const [loaded, setLoaded] = useState<{ viewer: object | null; results: Record<string, ClubTestResult | null | 'error'> }>({ viewer: null, results: {} });
  useEffect(() => {
    if (!staff) return;
    let live = true;
    const keep = (id: string, value: ClubTestResult | null | 'error') => {
      if (live) setLoaded(current => ({ viewer, results: { ...(current.viewer === viewer ? current.results : {}), [id]: value } }));
    };
    for (const id of Object.keys(CLUB_TESTS)) loadClubTest(viewer, id).then(result => keep(id, result), () => keep(id, 'error'));
    return () => { live = false; };
  }, [staff, viewer]);

  const test = CLUB_TESTS[metric.id];
  const result = loaded.viewer === viewer ? loaded.results[metric.id] : undefined;
  if (!staff || !test || !playerId || result === null) return null;
  if (result === undefined) return <section className="stats-club" aria-label="Club comparison" aria-busy="true">
    <p className="stats-loading" role="status"><span className="stats-spinner" aria-hidden="true" />Loading club comparison</p>
  </section>;
  if (result === 'error') return <section className="stats-club" aria-label="Club comparison"><p className="stats-club-empty">The club comparison could not be loaded.</p></section>;

  const station = test.source === 'station';
  const group = result.gender ? GENDER_LABEL[result.gender] : 'Everyone';
  const title = `${result.organizationName} · ${group}`;
  const plot = plotInputs(result.points, playerId);
  if (!plot.points.length) return <section className="stats-club" aria-label="Club comparison">
    <h3>{title}</h3><p className="stats-club-empty">{station ? 'No newly processed results for this test yet.' : 'No results for this test yet.'}</p>
  </section>;
  const own = plot.own;
  const rank = own ? percentileAmong(plot.points, own.value, test.higherIsBetter, playerId) : null;
  const plural = result.gender ?? 'athletes';
  const data: AgeCurveData = {
    scopeLabel: `${result.organizationName} ${plural}`, points: plot.points, curve: plot.curve, bands: [], missingAge: plot.missingAge, excluded: 0,
    athletes: plot.points.length, loading: false, error: null, gender: result.gender ?? 'unspecified', benchmarkLabel: null,
    currentRepKey: playerId, athleteName: '', estimatedAge: null, athleteValues: [],
  };
  const view: AgeCurveView = {
    className: 'stats-club rv-age', title,
    note: [`${plot.points.length} athletes, best each`, `${test.higherIsBetter ? 'higher' : 'lower'} is better`, station && 'newly processed results',
      !result.gender && 'no gender recorded, so everyone is shown', result.teamsOnly && 'your teams only', result.incomplete && 'some results could not be read']
      .filter(Boolean).join(' · '),
    display: test.display, higherIsBetter: test.higherIsBetter, colors: { others: OTHERS, highlight: ACCENT }, callout: 'YOU',
    xTick: age => `U${age}`, xLabel: 'age group', xOffset: point => ageJitter(point.playerId),
    readout: !own ? `No ${station ? 'newly processed ' : ''}result for you on this test.`
      : rank ? `Better than ${Math.round(rank.percent)}% of ${rank.n} ${plural}` : 'The only result so far.',
  };
  return <AgeCurve drillKey={test.drill} data={data} playerId={playerId} value={own?.value ?? null}
    age={own && own.ageGroup !== null ? { age: own.ageGroup, exact: true } : null} view={view} />;
}
