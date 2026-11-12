import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { elapsedSeconds, lastFrameIndex, phaseChipText, phaseForFrame, timerText } from '../../../home/pose-demo';
import type { PoseDemoData, PoseReference } from '../../../home/pose-demo';
import { createPoseDemoController } from '../../../home/use-pose-demo';
import type { PoseDemoController, PoseDemoOptions, PoseShadow } from '../../../home/use-pose-demo';
import { metricValue } from '../../../../lib/result-values';
import { drillByKey } from '../../lib/drills';
import type { Access } from '../../lib/loaders';
import { averageText } from '../report';
import type { AthleteTestReport, ReportMetric } from '../report';
import type { Row } from '../execution';
import { PEAK_HOLD_MS, alignShadow, reportAverageMeters, shadowClock, stageAspect, teamReference } from './rep-sequence';
import type { RepReplay } from './rep-sequence';
import { METRIC_TESTS, SPLITS, bestRep, loadTeamComparison, splitRow } from './test-comparison';
import type { TeamComparison } from './test-comparison';
import { STAFF, repReplay, teamShadow } from './test-replay';

type StageProps = { replay: RepReplay; shadow: PoseShadow | null; reference: PoseReference | null; hold: PoseDemoOptions['hold']; label: string };

/**
 * The replay itself: the homepage's pose demo controller (home/use-pose-demo.ts) on one rep, with
 * the recorded-movement framing and look, the rep's markers and ground, and the team: the median as a
 * shadow for the runs, the average as a reference line for the jumps. Plays when on screen (paused
 * under reduced motion), loops, and scrubs; a vertical jump pauses a second at full height.
 */
function RepStage({ replay, shadow, reference, hold, label }: StageProps) {
  const canvas = useRef<HTMLCanvasElement>(null), playButton = useRef<HTMLButtonElement>(null), playIcon = useRef<HTMLSpanElement>(null);
  const scrubber = useRef<HTMLInputElement>(null), timer = useRef<HTMLElement>(null), phaseChip = useRef<HTMLSpanElement>(null);
  const controller = useRef<PoseDemoController | null>(null), shadowRef = useRef(shadow);
  const sequence = replay.sequence;
  const data = useMemo<PoseDemoData>(() => ({ version: 1, layout: 'mediapipe33', fps: sequence.fps, sourceAspectRatio: replay.scene.aspect, sequences: [sequence], autoAdvance: false }), [sequence, replay.scene.aspect]);
  useEffect(() => {
    const nodes = [canvas.current, playButton.current, playIcon.current, scrubber.current, timer.current, phaseChip.current];
    if (nodes.some(node => !node)) return;
    const created = createPoseDemoController(data, {
      canvas: canvas.current!, playButton: playButton.current!, playIcon: playIcon.current!, scrubber: scrubber.current!,
      timer: timer.current!, phaseChip: phaseChip.current!, telemetryPhase: null,
    }, () => {}, { fitRecording: true, recordedLook: true, shadow: shadowRef.current, reference, hold });
    controller.current = created;
    return () => { created?.destroy(); controller.current = null; };
  }, [data, reference, hold]);
  useEffect(() => { shadowRef.current = shadow; controller.current?.setShadow(shadow); }, [shadow]);
  // First-paint text for the nodes the controller writes every frame (React never rewrites them).
  const initial = useMemo(() => {
    const phase = phaseForFrame(sequence, 0);
    return { timer: timerText(0, sequence, sequence.fps), phase: phaseChipText(phase, elapsedSeconds(0, sequence.fps)) };
  }, [sequence]);
  const style = { '--stage-aspect': stageAspect(replay, reference).toFixed(3) } as CSSProperties;
  return <>
    <div className="stats-stage" style={style}>
      <div className="stats-stage-grid" aria-hidden="true" />
      <canvas ref={canvas} role="img" aria-label={`${label}: recorded pose${reference ? `; ${reference.label}` : ''}`} />
      <span className="stats-stage-phase" ref={phaseChip}>{initial.phase}</span>
    </div>
    <div className="stats-stage-controls">
      <button className="stats-stage-play" ref={playButton} type="button" aria-label="Play pose playback" aria-pressed={false} onClick={() => controller.current?.togglePlay()}>
        <span ref={playIcon} data-playing="false" aria-hidden="true">
          <span className="material-symbols-outlined stats-icon-play">play_arrow</span><span className="material-symbols-outlined stats-icon-pause">pause</span>
        </span>
      </button>
      <input className="stats-stage-scrubber" ref={scrubber} type="range" min="0" max={lastFrameIndex(sequence)} defaultValue="0" step="1" aria-label="Replay position"
        onInput={event => controller.current?.scrub(event.currentTarget.value)} />
      <small className="stats-stage-time" ref={timer}>{initial.timer}</small>
    </div>
  </>;
}

const STANDING_WORDS = { better: 'better than the team', worse: 'behind the team', level: 'level with the team' } as const;

type Props = {
  metric: ReportMetric;
  report: AthleteTestReport;
  reps: Record<string, Row[]>;
  athlete: Row;
  access: Access;
  playerId: string | null;
  /** Opens the test's full results page (every session and rep). */
  onAllAttempts: () => void;
};

/**
 * The pose player under the score cards: the athlete's best rep of the chosen test as pose only
 * (never the video) — a skeleton for the jumps, a centre line as tall as the athlete for the tests
 * recorded without pose — the team (the median athlete as a fainter shadow on the runs, the team
 * average as a line on the jumps), and the rep's numbers beside the team's averages, each row
 * coloured by how the athlete compares. Replays are kept in memory (test-replay.ts), so a card
 * opened before shows at once.
 */
export default function TestPosePlayer({ metric, report, reps, athlete, access, playerId, onAllAttempts }: Props) {
  const test = METRIC_TESTS[metric.id], drill = drillByKey(test?.drill);
  const rep = useMemo(() => bestRep(metric, reps, report.testDateMillis), [metric, reps, report.testDateMillis]);
  // undefined while loading; null when the rep has nothing to replay.
  const [own, setOwn] = useState<RepReplay | null | undefined>(undefined), [error, setError] = useState(false);
  const [team, setTeam] = useState<TeamComparison | null>(null), [shadow, setShadow] = useState<RepReplay | null>(null);
  const repId = rep ? String(rep.id) : null, event = report.kind === 'event', shadowed = teamShadow(drill.key);
  useEffect(() => {
    if (!rep || !playerId) return;
    let alive = true;
    repReplay(drill, rep, access, playerId).then(replay => { if (alive) setOwn(replay); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
    // One load per rep: the rep object is replaced on every results refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repId, drill.key, access, playerId]);
  useEffect(() => {
    // The team's median and averages come from the team's own records, which only staff may read today.
    if (!event || !playerId || !STAFF.includes(access)) return;
    let alive = true;
    void loadTeamComparison(metric, athlete, playerId, report.testDateMillis).then(async comparison => {
      if (!alive || !comparison) return;
      setTeam(comparison);
      // The jumps draw no team figure, so their median's replay is never loaded.
      if (!comparison.median || !shadowed) return;
      const replay = await repReplay(drill, comparison.median.rep, access, comparison.median.playerId);
      if (alive && replay) setShadow(replay);
    }).catch(() => { /* The athlete's own replay stays usable without the comparison. */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric.id, event, access, playerId, athlete?.teamId, report.testDateMillis]);
  const ghost = useMemo<PoseShadow | null>(() => shadowed && own && shadow ? { sequence: alignShadow(own, shadow), frameFor: shadowClock(own, shadow) } : null, [shadowed, own, shadow]);
  const headlineAverage = event && (metric.count ?? 0) >= 5 ? averageText(metric) : null;
  // The jumps: the same report average as the table's headline row, as a line on the replay.
  const reference = useMemo(() => own && event && headlineAverage ? teamReference(own, reportAverageMeters(metric), `Team avg ${headlineAverage}`) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [own, event, headlineAverage, metric.average, metric.count]);
  const hold = useMemo(() => drill.key === 'jump' && own?.peak !== undefined && own?.peak !== null ? { frame: own.peak, ms: PEAK_HOLD_MS } : null, [drill.key, own]);
  const rows = rep ? (SPLITS[drill.key] || []).map(split => splitRow(split,
    metricValue(rep, split.field, own?.metadata || {}, split.fallbacks || []),
    team?.averages[split.field],
    // The report's own average for the headline number; the team's records for the other splits.
    split.field === test.field ? headlineAverage : null,
  )).filter(row => row.mine || row.average) : [];
  const compared = rows.some(row => row.average);
  return <section className="stats-pose" aria-label={`${metric.label} replay`} data-metric={metric.id}>
    <div className="stats-pose-head">
      <h3>{metric.label}</h3>
      {ghost && <span className="stats-pose-key"><i className="you" />You<i className="median" />Team median</span>}
    </div>
    {!rep ? <p className="stats-subheadline">No recorded attempt for this test yet.</p>
      : error ? <p className="stats-subheadline">This attempt could not be opened.</p>
        : own === undefined ? <p className="stats-loading" role="status"><span className="stats-spinner" aria-hidden="true" />Loading the replay</p>
          : own === null ? <p className="stats-subheadline">This attempt has no replay yet.</p>
            : <RepStage key={`${metric.id}:${repId}`} replay={own} shadow={ghost} reference={reference} hold={hold} label={metric.label} />}
    {rows.length > 0 && <div className={`stats-splits${compared ? ' compared' : ''}`} role="table" aria-label={`${metric.label} numbers`}>
      <div role="row" className="stats-splits-head">
        <span role="columnheader"><span className="stats-sr-only">Measure</span></span><span role="columnheader">You</span>
        {compared && <><span role="columnheader">Team avg</span><span role="columnheader">Diff</span></>}
      </div>
      {rows.map(row => <div role="row" key={row.label} data-standing={row.standing ?? undefined}>
        <span role="rowheader">{row.label}</span>
        <strong role="cell">{row.mine ?? '—'}</strong>
        {compared && <>
          <span role="cell" className="stats-split-team">{row.average ?? '—'}</span>
          <span role="cell">{row.difference && <span className="stats-split-diff">{row.difference}<span className="stats-sr-only">, {STANDING_WORDS[row.standing!]}</span></span>}</span>
        </>}
      </div>)}
    </div>}
    {rep && <button type="button" className="stats-text-button stats-pose-all" onClick={onAllAttempts}>All attempts<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>}
  </section>;
}
