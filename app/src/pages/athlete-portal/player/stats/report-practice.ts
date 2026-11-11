import type { Row } from '../execution';

/**
 * "Two drills from your plan": the web copy of the app's `AthleteReportPractice.samples`
 * (KickAI/Stats/AthleteTestReport.swift). Only drills from the athlete's own active saved plan are
 * previewed, at most two, in plan order, and only drills the catalog lists as published.
 */
export type ReportPractice = { id: string; name: string; reason: string };

/** The two catalog facts the samples read: the resolved publication status and the transfer note. */
export type PracticeCatalogEntry = { drillId: string; published: boolean; technicalTransfer: string };

const GENERAL_REASON = 'General practice from your saved plan, not a drill selected here to correct a measured weakness.';

const isRecord = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
/** The app's `intValue`: a number is truncated to an integer; anything else is the default. */
const intValue = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/**
 * `CatalogDrill.resolvedStatus == .published`: a known `status` wins; a document without one is
 * published only when it carries a dose (the media-only rows have none and read as draft).
 */
export function catalogEntry(id: string, raw: unknown): PracticeCatalogEntry {
  const data = isRecord(raw) ? raw : {};
  const status = data.status === 'draft' || data.status === 'published' || data.status === 'archived' ? data.status : null;
  const dose = isRecord(data.dose) ? data.dose : {};
  const doseEmpty = intValue(dose.setsMax) === 0 && (typeof dose.repsMax === 'number' ? dose.repsMax : 0) === 0 && !text(dose.doseText);
  return { drillId: id, published: status ? status === 'published' : !doseEmpty, technicalTransfer: text(data.technicalTransfer) };
}

const millis = (value: unknown): number => {
  const stamp = value as { toMillis?: () => number } | null | undefined;
  if (stamp && typeof stamp.toMillis === 'function') return stamp.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
};

/** `TrainingPlanStore`'s active listener: `status == active`, newest `generatedAt` first, one plan. */
export function activeTrainingPlan(plans: Row[]): Row | null {
  return plans.filter(plan => plan?.status === 'active').sort((a, b) => millis(b.generatedAt) - millis(a.generatedAt))[0] || null;
}

type Block = { drillId: string; name: string; sets: number; reps: number; order: number; isMeasuredDrill: boolean };

function parseBlock(raw: unknown): Block | null {
  if (!isRecord(raw) || !text(raw.blockId)) return null;
  return { drillId: text(raw.drillId), name: text(raw.name), sets: intValue(raw.sets), reps: intValue(raw.reps), order: intValue(raw.order), isMeasuredDrill: raw.isMeasuredDrill === true };
}

/** `PlanWorkout.parse`: nil without an id; a V3 plan with an unreadable workout is unreadable. */
function parseWorkout(raw: unknown): { order: number; blocks: Block[] } | null {
  if (!isRecord(raw) || !text(raw.workoutId)) return null;
  const rawBlocks = list(raw.blocks);
  if (rawBlocks.some(block => isRecord(block) && (block.isMeasuredDrill !== undefined || block.measuredDrillType !== undefined))) return null;
  const blocks = rawBlocks.map(parseBlock).filter((block): block is Block => block !== null);
  if (blocks.length !== rawBlocks.length) return null;
  if (blocks.some(block => !block.drillId) || rawBlocks.some(block => isRecord(block) && block.kind === 'retest') || raw.isRetest !== undefined) return null;
  return { order: intValue(raw.order, 1), blocks };
}

type Week = { weekNumber: number; workouts: { order: number; blocks: Block[] }[]; drills: Block[] };

/** The part of `TrainingPlan.parse` the samples depend on; null when the app would not read the plan. */
export function readPlan(raw: unknown): { playerId: string; status: string; requiresTrainingStartAuthorization: boolean; weeks: Week[] } | null {
  if (!isRecord(raw)) return null;
  const schemaVersion = intValue(raw.schemaVersion, 1);
  if (![1, 2, 3].includes(schemaVersion)) return null;
  if (typeof raw.playerId !== 'string' || typeof raw.status !== 'string' || typeof raw.startDate !== 'string') return null;
  const weeks: Week[] = [];
  for (const week of list(raw.weeks)) {
    if (!isRecord(week)) continue;
    const rawWorkouts = list(week.workouts);
    const workouts = rawWorkouts.map(parseWorkout);
    if (schemaVersion === 3 && workouts.some(workout => workout === null)) return null;
    const weekNumber = intValue(week.weekNumber, 0);
    if (weekNumber < 1) continue;
    const drills = list(week.drills).flatMap(drill => isRecord(drill) && text(drill.drillId)
      ? [{ drillId: text(drill.drillId), name: text(drill.name), sets: intValue(drill.sets), reps: intValue(drill.reps), order: 0, isMeasuredDrill: false }] : []);
    weeks.push({ weekNumber, workouts: workouts.filter((workout): workout is NonNullable<typeof workout> => workout !== null), drills });
  }
  return { playerId: raw.playerId, status: raw.status, requiresTrainingStartAuthorization: raw.requiresTrainingStartAuthorization === true, weeks };
}

const byKey = <T,>(items: T[], key: (item: T) => number) => items.map((item, index) => ({ item, index }))
  .sort((a, b) => key(a.item) - key(b.item) || a.index - b.index).map(entry => entry.item);

/** Every drill the samples would consider, in the order the app walks the plan. */
function planDrills(plan: NonNullable<ReturnType<typeof readPlan>>): Block[] {
  return byKey(plan.weeks, week => week.weekNumber).flatMap(week => [
    ...byKey(week.workouts, workout => workout.order).flatMap(workout => byKey(workout.blocks, block => block.order).filter(block => !block.isMeasuredDrill)),
    ...week.drills,
  ]);
}

/** The catalog documents the samples could need, so a caller reads only those. */
export function practiceCandidateIds(rawPlan: unknown, playerId: string): string[] {
  const plan = readPlan(rawPlan);
  if (!plan || plan.playerId !== playerId || plan.status !== 'active' || plan.requiresTrainingStartAuthorization) return [];
  return [...new Set(planDrills(plan).filter(drill => drill.sets > 0 && drill.reps > 0 && drill.name.trim() && drill.drillId).map(drill => drill.drillId))];
}

/** `AthleteReportPractice.samples(plan:playerID:catalog:)`. */
export function reportPracticeSamples(rawPlan: unknown, playerId: string, catalog: PracticeCatalogEntry[]): ReportPractice[] {
  const plan = readPlan(rawPlan);
  if (!plan || plan.playerId !== playerId || plan.status !== 'active' || plan.requiresTrainingStartAuthorization) return [];
  const samples: ReportPractice[] = [];
  for (const { drillId: id, name, sets, reps } of planDrills(plan)) {
    if (samples.length >= 2 || samples.some(sample => sample.id === id) || sets <= 0 || reps <= 0 || !name.trim()) continue;
    const drill = catalog.find(entry => entry.drillId === id);
    if (!drill || !drill.published) continue;
    samples.push({ id, name, reason: GENERAL_REASON + (drill.technicalTransfer ? ` ${drill.technicalTransfer}` : '') });
  }
  return samples;
}
