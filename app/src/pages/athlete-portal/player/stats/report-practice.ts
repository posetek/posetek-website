import { blockDoseLine, normalizeCatalogDrill } from '../../../../lib/contracts/drillV2';
import { domainLabel } from '../../../../lib/contracts/types';
import type { Row } from '../execution';
import { EQUIPMENT_LABELS } from '../training-access';

/**
 * "Two drills from your plan": the web copy of the app's `AthleteReportPractice.samples`
 * (KickAI/Stats/AthleteTestReport.swift). Only drills from the athlete's own active saved plan are
 * previewed, at most two, in plan order, and only drills the catalog lists as published.
 *
 * Each sample also carries what the parent one-pager's drill card shows (`private-report/render.mjs`,
 * layout `focused-v1`): a tag (the drill's focus), the dose from the saved plan, the catalog's
 * instruction and equipment. A field is null when its data is missing, so the card leaves it out.
 */
export type ReportPractice = {
  id: string; name: string; reason: string;
  tag: string | null; dose: string | null; instruction: string | null; equipment: string | null;
};

/**
 * The catalog facts the samples read: the resolved publication status, the transfer note, and the
 * drill card's focus, instruction and equipment (null or empty when the row has none).
 */
export type PracticeCatalogEntry = {
  drillId: string; published: boolean; technicalTransfer: string;
  domain?: string; instruction?: string | null; equipment?: string[];
};

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
  // The shared normalizer reads both catalog schemas: v2 `howTo`, or v1 `setup` / `execution`.
  const drill = normalizeCatalogDrill(id, data);
  const steps = drill.howTo.steps.map(step => step.trim()).filter(Boolean);
  return {
    drillId: id, published: status ? status === 'published' : !doseEmpty, technicalTransfer: text(data.technicalTransfer),
    domain: drill.domain, instruction: steps.length ? steps.join(' ') : drill.howTo.setup.trim() || null, equipment: drill.equipment,
  };
}

/** The card's "Equipment:" text, in the athlete-facing names the workout setup uses. */
export const equipmentText = (equipment: string[] | undefined): string | null => {
  const names = (equipment || []).map(item => EQUIPMENT_LABELS[item] || item).filter(Boolean);
  return names.length ? names.join(', ') : null;
};

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

type Block = {
  drillId: string; name: string; sets: number; reps: number; order: number; isMeasuredDrill: boolean;
  /** What the dose line and tag read from the saved plan. */
  domain: string; repUnit: string; perSide: boolean; restSeconds: number; restScope: string; estimatedMinutes: number;
};

/** The plan's own prescription fields, shared by workout blocks and older plans' week drills. */
const prescription = (raw: Row) => ({
  drillId: text(raw.drillId), name: text(raw.name), sets: intValue(raw.sets), reps: intValue(raw.reps),
  domain: text(raw.domain), repUnit: text(raw.repUnit) || 'reps', perSide: raw.perSide === true, restSeconds: intValue(raw.restSeconds),
  restScope: text(raw.restScope) || 'sets', estimatedMinutes: intValue(raw.estimatedMinutes),
});

function parseBlock(raw: unknown): Block | null {
  if (!isRecord(raw) || !text(raw.blockId)) return null;
  return { ...prescription(raw), order: intValue(raw.order), isMeasuredDrill: raw.isMeasuredDrill === true };
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
      ? [{ ...prescription(drill), perSide: false, restScope: 'sets', order: 0, isMeasuredDrill: false }] : []);
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

/**
 * Reads only the catalog rows the samples can reach. The candidates are the plan's eligible drills
 * in sample order (first eligible occurrence of each id), so the samples are the first two
 * candidates whose row is published. Rows are read in plan order, as many at a time as drills are
 * still needed, and reading stops once two are published. `reportPracticeSamples` over these rows
 * equals it over the whole catalog. A failed or missing read counts as "not in the catalog".
 */
export async function readPracticeCatalog(rawPlan: unknown, playerId: string,
  read: (drillId: string) => Promise<PracticeCatalogEntry | null>): Promise<PracticeCatalogEntry[]> {
  const ids = practiceCandidateIds(rawPlan, playerId), entries: PracticeCatalogEntry[] = [];
  let next = 0, chosen = 0;
  while (chosen < 2 && next < ids.length) {
    const batch = ids.slice(next, next + 2 - chosen);
    next += batch.length;
    const rows = await Promise.all(batch.map(id => read(id).catch(() => null)));
    for (const row of rows) if (row) { entries.push(row); if (row.published) chosen += 1; }
  }
  return entries;
}

/** `AthleteReportPractice.samples(plan:playerID:catalog:)`. */
export function reportPracticeSamples(rawPlan: unknown, playerId: string, catalog: PracticeCatalogEntry[]): ReportPractice[] {
  const plan = readPlan(rawPlan);
  if (!plan || plan.playerId !== playerId || plan.status !== 'active' || plan.requiresTrainingStartAuthorization) return [];
  const samples: ReportPractice[] = [];
  for (const block of planDrills(plan)) {
    const { drillId: id, name, sets, reps } = block;
    if (samples.length >= 2 || samples.some(sample => sample.id === id) || sets <= 0 || reps <= 0 || !name.trim()) continue;
    const drill = catalog.find(entry => entry.drillId === id);
    if (!drill || !drill.published) continue;
    samples.push({
      // The app appends the catalog's technical-transfer text. In the live catalog that field is a
      // one-word level ("isolated"), which reads as a stray word, so only a written sentence is added.
      id, name, reason: GENERAL_REASON + (/\s/.test(drill.technicalTransfer.trim()) ? ` ${drill.technicalTransfer.trim()}` : ''),
      tag: domainLabel(block.domain || drill.domain || '') || null,
      dose: blockDoseLine(block),
      instruction: drill.instruction || null,
      equipment: equipmentText(drill.equipment),
    });
  }
  return samples;
}
