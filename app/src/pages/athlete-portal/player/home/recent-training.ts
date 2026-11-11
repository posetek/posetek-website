import firebase, { db } from '../../../../lib/firebase';
import { loadCatalogDrill } from '../../lib/workout-store';

/**
 * The web copy of the app's `RecentTraining` (KickAI/Community/AthleteWorkspaceHome.swift): the
 * seven-day count behind "Your week", the previous week, the three most recent completions and
 * the progression line. The rules are pure functions over parsed records so they can be tested
 * against the app's behavior; `loadRecentTraining` runs the app's two Firestore queries.
 */

const DONE = 'done', PARTIAL = 'partial', SKIPPED = 'skipped';
const YOGA_POLICY = 'yoga-v1';

/** One row of a log's `blocks` (`WorkoutBlockLog`). */
export type BlockLog = { blockId: string; drillId: string; status: string; setsCompleted: number };
/** One planned block (`WorkoutBlock`), from a log's `workoutSnapshot.blocks` or `sessionBlocks`. */
export type PlanBlock = { blockId: string; drillId: string; name: string; sets: number; reps: number; repUnit: string; perSide: boolean };
/** The parts of `PlanWorkout` these rules read. Null when the app's parser would reject the snapshot. */
export type WorkoutSnapshot = { title: string; blocks: PlanBlock[]; yoga: boolean };
export type WorkoutLog = {
  id: string;
  endedAt: Date | null;
  linkedTrainingSessionId: string | null;
  blocks: BlockLog[];
  workoutSnapshot: WorkoutSnapshot | null;
  sessionBlocks: PlanBlock[] | null;
  sessionYoga: boolean;
};
export type SessionRef = { drillType: string; addedAt: Date };
export type TrainingSession = { id: string; endedAt: Date | null; sessionRefs: SessionRef[] };
/** A GPS run, ride or walk. The app reads these from the phone; the website has no source for them. */
export type OutdoorRun = { id: string; endedAt: Date | null; title: string };

export type RecentTraining = {
  logs: WorkoutLog[];
  sessions: TrainingSession[];
  /** The raw `workoutSnapshot.title` (or `name`) by log id; older snapshots keep one without a valid payload. */
  storedWorkoutTitles: Record<string, string>;
  /** Catalog names by drill id, the app's `DrillCatalogStore` fallback for a block without a name. */
  catalogNames?: Record<string, string>;
};

export type RecentWorkout = { id: string; title: string; completed: Date };

// MARK: - Calendar (the app's `Calendar.current`: local days, so a DST change keeps whole days)

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// MARK: - Rules

const isCompletedBlock = (block: BlockLog) => block.status === DONE || block.status === PARTIAL;
const completedLogs = (training: RecentTraining) => training.logs.filter(log => log.blocks.some(isCompletedBlock));
function unlinkedSessions(training: RecentTraining) {
  const linked = new Set(completedLogs(training).map(log => log.linkedTrainingSessionId).filter((id): id is string => !!id));
  return training.sessions.filter(session => session.sessionRefs.length > 0 && !linked.has(session.id));
}

/** Recorded sessions in the last seven days (today and the six before it) and in the seven days before those. */
export function weekSummary(training: RecentTraining, runs: OutdoorRun[], now: Date): { current: number; previous: number } {
  const week = addDays(startOfDay(now), -6), prior = addDays(week, -7);
  const dates = [...completedLogs(training), ...unlinkedSessions(training), ...runs]
    .map(item => item.endedAt).filter((date): date is Date => !!date);
  return {
    current: dates.filter(date => date >= week && date <= now).length,
    previous: dates.filter(date => date >= prior && date < week).length,
  };
}

const SESSION_LABELS: Record<string, string> = {
  jump: 'Jump', sprint: 'Sprint', deadballShot: 'Shoot', broadJump: 'Broad Jump',
  dribbling: 'Dribbling', changeOfDirection: 'COD', freeRecord: 'Free',
};
/** Swift's `String.capitalized`: each word's first letter upper case, the rest lower case. */
const capitalized = (text: string) => text.toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());

/** `TrainingSessionSummary.drillSummaryLine`. */
export function drillSummaryLine(session: TrainingSession): string {
  const labels = [...session.sessionRefs].sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
    .map(ref => SESSION_LABELS[ref.drillType] ?? capitalized(ref.drillType));
  return labels.length ? labels.join(' · ') : 'No drills yet';
}

/** The app's `workoutTitle`: the stored title, else the first completed block's name, else Yoga or Workout. */
export function workoutTitle(training: RecentTraining, log: WorkoutLog): string {
  const stored = (training.storedWorkoutTitles[log.id] ?? log.workoutSnapshot?.title)?.trim();
  if (stored && stored !== 'Workout') return stored;
  const blocks = [...(log.sessionBlocks ?? []), ...(log.workoutSnapshot?.blocks ?? [])];
  for (const recorded of log.blocks) {
    if (!isCompletedBlock(recorded)) continue;
    const name = blocks.find(block => block.blockId === recorded.blockId && block.drillId === recorded.drillId)?.name
      ?? training.catalogNames?.[recorded.drillId];
    if (name?.trim()) return name.trim();
  }
  if (log.sessionYoga || log.workoutSnapshot?.yoga) return 'Yoga';
  return 'Workout';
}

/** The same completions "Your week" counts, newest first, at most three: shown when organization activity is unavailable. */
export function recentWorkouts(training: RecentTraining, runs: OutdoorRun[], now: Date): RecentWorkout[] {
  const start = addDays(startOfDay(now), -6);
  const rows = [
    ...completedLogs(training).map(log => ({ id: `workout-${log.id}`, date: log.endedAt, title: () => workoutTitle(training, log) })),
    ...unlinkedSessions(training).map(session => ({ id: `session-${session.id}`, date: session.endedAt, title: () => drillSummaryLine(session) })),
    ...runs.map(run => ({ id: `run-${run.id}`, date: run.endedAt, title: () => run.title })),
  ].filter((row): row is typeof row & { date: Date } => !!row.date && row.date >= start && row.date <= now);
  rows.sort((a, b) => b.date.getTime() - a.date.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return rows.slice(0, 3).map(row => ({ id: row.id, title: row.title(), completed: row.date }));
}

/**
 * The same exercise and prescription on two different completed days within two weeks, when the
 * number of completed sets differs. Sets describe recorded volume, never a change in speed or ability.
 */
export function progression(training: RecentTraining, now: Date): { text: string; date: Date } | null {
  const cutoff = addDays(startOfDay(now), -13);
  const compared = new Set<string>();
  const latest = new Map<string, { name: string; sets: number; date: Date }>();
  const ordered = [...training.logs].sort((a, b) => (b.endedAt?.getTime() ?? -Infinity) - (a.endedAt?.getTime() ?? -Infinity));
  for (const log of ordered) {
    const date = log.endedAt, workout = log.workoutSnapshot;
    if (!date || date < cutoff || date > now || !workout) continue;
    for (const block of log.blocks) {
      if (block.setsCompleted <= 0 || block.status === SKIPPED) continue;
      const plan = workout.blocks.find(item => item.blockId === block.blockId && item.drillId === block.drillId);
      if (!plan || !plan.name || !plan.drillId || plan.reps <= 0 || plan.sets <= 0) continue;
      const key = [plan.drillId, plan.sets, plan.reps, plan.repUnit, plan.perSide].join('|');
      if (compared.has(key)) continue;
      const newer = latest.get(key);
      if (newer) {
        if (sameDay(newer.date, date)) continue;
        compared.add(key);
        if (newer.sets === block.setsCompleted) continue;
        return { text: `${newer.name}: ${newer.sets} sets completed, compared with ${block.setsCompleted} last time.`, date: newer.date };
      }
      latest.set(key, { name: plan.name, sets: block.setsCompleted, date });
    }
  }
  return null;
}

/** "Your week" for the athlete; "<name>’s week" for staff looking at an athlete (the app tests `userType == "Player"`). */
export function weekTitle(access: string, playerName: string): string {
  return access === 'athlete' || access === 'preview' ? 'Your week' : `${playerName}’s week`;
}
export const sessionCountText = (count: number) => count === 1 ? '1 recorded session' : `${count} recorded sessions`;

// MARK: - Parsing (the app's `WorkoutLog.parse`, `PlanWorkout.parse`, `TrainingSessionSummary.parse`)

type Data = Record<string, unknown>;
const isRecord = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);
/** A Firestore Timestamp (anything with `toDate`), or a Date in the local preview. */
export function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const date = (value as { toDate?: () => Date } | null)?.toDate?.();
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
}
const int = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
const str = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const records = (value: unknown): Data[] => Array.isArray(value) ? value.filter(isRecord) : [];

function parsePlanBlock(raw: Data): PlanBlock | null {
  const blockId = str(raw.blockId);
  if (!blockId) return null;
  return { blockId, drillId: str(raw.drillId), name: str(raw.name), sets: int(raw.sets), reps: int(raw.reps),
    repUnit: str(raw.repUnit, 'reps'), perSide: raw.perSide === true };
}

/** `PlanWorkout.parse`: rejects measured or retest blocks and inconsistent yoga snapshots. */
export function parseWorkoutSnapshot(raw: unknown): WorkoutSnapshot | null {
  if (!isRecord(raw) || !str(raw.workoutId)) return null;
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (rawBlocks.some(block => isRecord(block) && (block.isMeasuredDrill !== undefined || block.measuredDrillType !== undefined))) return null;
  const blocks = rawBlocks.map(block => isRecord(block) ? parsePlanBlock(block) : null);
  if (blocks.some(block => block === null)) return null;
  if ((blocks as PlanBlock[]).some((block, index) => !block.drillId || (rawBlocks[index] as Data).kind === 'retest') || raw.isRetest !== undefined) return null;
  const yoga = raw.yoga !== undefined;
  if (raw.workoutType === 'yoga' || raw.executionPolicy !== undefined || yoga) {
    // The app also checks that the yoga plan matches its block projection (`YogaPlan.matchesProjection`).
    if (raw.executionPolicy !== YOGA_POLICY || raw.workoutType !== 'yoga' || !isRecord(raw.yoga)) return null;
  }
  return { title: str(raw.title, 'Workout'), blocks: blocks as PlanBlock[], yoga };
}

/** `WorkoutLog.parse`; null for a log the app skips. */
export function parseWorkoutLog(id: string, data: Data): WorkoutLog | null {
  if (typeof data.planId !== 'string' || !asDate(data.startedAt)) return null;
  if (data.sessionYoga !== undefined && !isRecord(data.sessionYoga)) return null;
  return {
    id, endedAt: asDate(data.endedAt),
    linkedTrainingSessionId: typeof data.linkedTrainingSessionId === 'string' ? data.linkedTrainingSessionId : null,
    blocks: records(data.blocks).filter(block => str(block.blockId)).map(block => ({
      blockId: str(block.blockId), drillId: str(block.drillId), status: str(block.status, SKIPPED), setsCompleted: int(block.setsCompleted),
    })),
    workoutSnapshot: parseWorkoutSnapshot(data.workoutSnapshot),
    sessionBlocks: Array.isArray(data.sessionBlocks) ? records(data.sessionBlocks).map(parsePlanBlock).filter((block): block is PlanBlock => !!block) : null,
    sessionYoga: isRecord(data.sessionYoga),
  };
}

/** The raw title kept for a log whose snapshot may not parse. */
export function storedTitle(data: Data): string | undefined {
  const snapshot = isRecord(data.workoutSnapshot) ? data.workoutSnapshot : undefined;
  const title = snapshot?.title, name = snapshot?.name;
  return typeof title === 'string' ? title : typeof name === 'string' ? name : undefined;
}

/** `TrainingSessionSummary.parse`. */
export function parseTrainingSession(id: string, data: Data): TrainingSession | null {
  if (!asDate(data.startedAt)) return null;
  return {
    id, endedAt: asDate(data.endedAt),
    sessionRefs: records(data.sessionRefs).filter(ref => str(ref.sessionDocId)).map(ref => ({
      drillType: str(ref.drillType), addedAt: asDate(ref.addedAt) ?? new Date(),
    })),
  };
}

/** Builds the record set from documents, as `RecentTraining.load` does after its queries. */
export function recentTrainingFrom(logDocs: { id: string; data: Data }[], sessionDocs: { id: string; data: Data }[]): RecentTraining {
  const logs: WorkoutLog[] = [], storedWorkoutTitles: Record<string, string> = {};
  for (const doc of logDocs) {
    const log = parseWorkoutLog(doc.id, doc.data);
    if (!log) continue;
    logs.push(log);
    const title = storedTitle(doc.data);
    if (title !== undefined) storedWorkoutTitles[log.id] = title;
  }
  const sessions = sessionDocs.map(doc => parseTrainingSession(doc.id, doc.data)).filter((session): session is TrainingSession => !!session);
  return { logs, sessions, storedWorkoutTitles };
}

/** Drill ids whose name only the catalog can supply. */
export function drillsNeedingCatalog(training: RecentTraining): string[] {
  const ids = new Set<string>();
  for (const log of training.logs) {
    const blocks = [...(log.sessionBlocks ?? []), ...(log.workoutSnapshot?.blocks ?? [])];
    for (const recorded of log.blocks) {
      if (isCompletedBlock(recorded) && recorded.drillId && !blocks.some(block => block.blockId === recorded.blockId && block.drillId === recorded.drillId)) ids.add(recorded.drillId);
    }
  }
  return [...ids];
}

/**
 * The app's two queries: workout logs and training sessions that ended on or after the start of
 * the day thirteen days ago. The app also merges the camera-guided Yoga/Core logs it keeps on the
 * phone; those never reach the backend, so the website cannot count them.
 */
export async function loadRecentTraining(playerId: string, now: Date): Promise<RecentTraining> {
  const since = firebase.firestore.Timestamp.fromDate(addDays(startOfDay(now), -13));
  const player = db.collection('players').doc(playerId);
  const [logs, sessions] = await Promise.all([
    player.collection('workoutLogs').where('endedAt', '>=', since).get(),
    player.collection('trainingSessions').where('endedAt', '>=', since).get(),
  ]);
  const training = recentTrainingFrom(logs.docs.map(doc => ({ id: doc.id, data: doc.data() })), sessions.docs.map(doc => ({ id: doc.id, data: doc.data() })));
  const needed = drillsNeedingCatalog(training);
  if (!needed.length) return training;
  const drills = await Promise.all(needed.map(loadCatalogDrill));
  const catalogNames: Record<string, string> = {};
  needed.forEach((id, index) => { const name = drills[index]?.name; if (typeof name === 'string') catalogNames[id] = name; });
  return { ...training, catalogNames };
}

/** Sample training for the local preview: three completions this week, two last week and a progression. */
export function previewTraining(now: Date): RecentTraining {
  const at = (days: number, hour: number) => { const date = addDays(startOfDay(now), -days); date.setHours(hour, 15); return date; };
  const plan: PlanBlock = { blockId: 'b1', drillId: 'STR-010', name: 'Split squat', sets: 3, reps: 8, repUnit: 'reps', perSide: true };
  const log = (id: string, ended: Date, sets: number, title = 'Build strength. Move faster.'): WorkoutLog => ({
    id, endedAt: ended, linkedTrainingSessionId: null, sessionBlocks: null, sessionYoga: false,
    blocks: [{ blockId: 'b1', drillId: 'STR-010', status: sets >= 3 ? DONE : PARTIAL, setsCompleted: sets }],
    workoutSnapshot: { title, blocks: [plan], yoga: false },
  });
  const last = at(0, 7) <= now ? at(0, 7) : at(1, 18);
  return {
    logs: [log('w1', last, 3), log('w2', at(3, 17), 2), log('w3', at(9, 17), 2)],
    sessions: [
      { id: 's1', endedAt: at(2, 16), sessionRefs: [{ drillType: 'sprint', addedAt: at(2, 15) }, { drillType: 'jump', addedAt: at(2, 16) }] },
      { id: 's2', endedAt: at(10, 16), sessionRefs: [{ drillType: 'deadballShot', addedAt: at(10, 16) }] },
    ],
    storedWorkoutTitles: { w1: 'Build strength. Move faster.', w2: 'Build strength. Move faster.', w3: 'Build strength. Move faster.' },
  };
}
