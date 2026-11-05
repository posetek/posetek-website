// Invented browser-local data only. Never imported by a production entry.
const reads: { kind: string; id: string }[] = [];
const writes: string[] = [];
const denied: string[] = [];
const clone = <T,>(value: T): T => structuredClone(value);
const reject = (operation: string): never => { denied.push(operation); throw new Error(`Synthetic preview forbids ${operation}`); };
const metrics = {
  startFrame: 0, phase1EndFrame: 20, apexFrame: 31, phase2EndFrame: 40, endFrame: 59,
  totalTime: 59 / 30, phase1Time: 20 / 30, phase2Time: 20 / 30, phase3Time: 19 / 30,
  phase1Percent: 20 / 59 * 100, phase2Percent: 20 / 59 * 100, phase3Percent: 19 / 59 * 100,
  totalDistance: null, outboundDistance: null, returnDistance: null, avgBallDistance: null,
  processingStatus: 'complete', resultsValid: true, failedSteps: [],
};
const detection = (index: number, x: number) => ({ index, timestampMs: index / 30 * 1000,
  person: { x, y: .15, w: .22, h: .7 }, com: { x: x + .11, y: .5 },
  ball: { x: x + .25, y: .78, w: .06, h: .06 },
});
const tracking = { schemaVersion: 1, drill: 'dribbling', fps: 30, frameCount: 60,
  coordinates: 'normalized_top_left', frames: [detection(0, .12), detection(6, .3), detection(31, .58), detection(59, .2)] };
const pose = Array.from({ length: 60 }, (_, frame) => Array.from({ length: 33 }, (_, index) =>
  [.25 + index % 5 * .05 + frame / 600, .15 + Math.floor(index / 5) * .1, 0, .99]));
const cases = new Set(['tracking', 'metadata', 'pose', 'video', 'tracking-error', 'sprint-geometry', 'unknown-timing']);
function known(id: string) { if (!cases.has(id)) reject(`unknown fixture ${id}`); return id; }
export const fixture = { reads, writes, denied, ids: [...cases] };
(window as any).__repPlayback = fixture;

export async function loadPlayer(id: string) {
  if (id !== 'synthetic-athlete') reject(`player ${id}`);
  reads.push({ kind: 'player', id });
  return { id, name: 'Synthetic Athlete', email: 'athlete@example.test', raw: {} };
}
export async function loadRep(_playerId: string, id: string) {
  known(id); reads.push({ kind: 'rep', id });
  const drill = id === 'sprint-geometry' ? 'sprint' : 'dribbling';
  return clone({ id, repType: drill, drillType: drill, sessionNumber: 1, repNumber: 1,
    createdAt: '2026-01-01T12:00:00Z', ...metrics, ...(drill === 'sprint' ? { max_velocity: 6 } : {}) });
}
export async function loadRepArtifacts(_drill: unknown, rep: { id: string }) {
  const id = known(rep.id); reads.push({ kind: 'artifacts', id });
  const files = ['metadata.json', 'reprocess_context.json'];
  if (['tracking', 'sprint-geometry', 'unknown-timing'].includes(id)) files.push('tracking.json');
  if (id === 'pose') files.push('pose.json');
  if (id === 'video') files.push('synthetic.mp4');
  if (id === 'tracking-error') files.push('tracking.json');
  return clone({ folder: `synthetic-athlete/dribbling/session1/${id}`, sessionRoot: 'synthetic-athlete/dribbling/session1',
    mediaUrl: id === 'video' ? '/__rep-playback/synthetic.mp4' : null,
    mediaName: id === 'video' ? 'synthetic.mp4' : null,
    pose: id === 'pose' ? pose : null,
    tracking: id === 'tracking' ? tracking : id === 'sprint-geometry' ? { ...tracking, drill: 'sprint' }
      : id === 'unknown-timing' ? { ...tracking, fps: undefined, frames: tracking.frames.map(({ timestampMs: _time, ...frame }) => frame) } : null,
    trackingLoadError: id === 'tracking-error',
    metadata: { ...metrics, ...(id === 'sprint-geometry' ? { frameWidth: 1280, frameHeight: 720, max_velocity: 6 }
      : { videoDisplayWidth: 320, videoDisplayHeight: 180, ...(id === 'unknown-timing' ? {} : { framesPerSecond: 30 }) }),
      ...(id === 'metadata' || id === 'tracking-error' ? { totalFrames: 600 } : {}),
      poseComputed: id === 'pose' },
    reprocessContext: ['sprint-geometry', 'unknown-timing'].includes(id) ? null : { capture: { clipFramesPerSecondUsed: 30 } },
    arucoCorners: null, markerConfig: null, adminAnnotations: null, ballBoxes: null, jumpTechnique: {}, files });
}
export async function loadRepRevisions(_playerId: string, id: string) {
  known(id); reads.push({ kind: 'revisions', id }); return [];
}
const denyWrite = (kind: string) => { writes.push(kind); return reject(kind); };
export async function pushRepRevision() { return denyWrite('pushRepRevision'); }
export async function restoreRepRevision() { return denyWrite('restoreRepRevision'); }
export async function pushJumpTechnique() { return denyWrite('pushJumpTechnique'); }

// Defensive fallback for transitive data-module imports. There is no live SDK.
const forbidden = new Proxy(() => reject('firebase call'), {
  get: (_target, key) => { if (key === 'then') return undefined; return forbidden; },
  apply: () => reject('firebase call'),
});
export const auth = { currentUser: null };
export const db = forbidden, storage = forbidden, cloud = forbidden;
export default forbidden;
