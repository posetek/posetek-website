// Pure rules behind the Workouts tab, ported from the app so each one can be pinned by a test:
// the training focus fold (`TrainingFocusBuilder` / `TrainingStatsBuilder`), the resume banner
// (`TrainingResumeTarget`), saved workouts (`SavedWorkoutsSection` / `SavedWorkoutEntry`), the plan
// card (`MyWorkoutPlanCardModel`), My workout plan's sections (`MyWorkoutPlanSection`), the plan
// page's content (`TrainingHubPlanPage`) and the history row summary (`TrainingHistoryView`).
import { currentWeekNumber, localDayString, planHorizonWeeks, planLogId, weekWindow } from '../../../../lib/contracts/planV3';
import { domainFromLegacy } from '../../../../lib/contracts/drillV2';
import type { Row } from '../execution';

export const millis = (value: any): number => {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
};

// MARK: - Training focus (stats row and breakdown card)

export type TimeBasis = 'total' | 'active';
export type Period = 'week' | 'month' | 'year' | 'allTime';
export const PERIODS: Period[] = ['week', 'month', 'year', 'allTime'];
export const TIME_BASES: TimeBasis[] = ['total', 'active'];
export const PERIOD_TITLE: Record<Period, string> = { week: 'Week', month: 'Month', year: 'Year', allTime: 'All time' };
export const PERIOD_CAPTION: Record<Period, string> = { week: 'this week', month: 'this month', year: 'this year', allTime: 'all time' };
export const TIME_BASIS_TITLE: Record<TimeBasis, string> = { total: 'Total time', active: 'Active time' };
export const TIME_BASIS_EXPLANATION: Record<TimeBasis, string> = {
  total: 'Workout time includes rests and transitions, excluding workout pauses and warm-up. Outdoor time includes stops. Time is shared across drills; older sessions may use estimates.',
  active: 'Recorded work intervals only; runs and rides use GPS moving time. Rests, pauses and unavailable timing are excluded.',
};

/** `TrainingActivityCategory` plus `.other`, in the app's sort order. */
export type FocusCategory = 'biking' | 'running' | 'walking' | 'soccer' | 'core' | 'gym' | 'hiit' | 'yoga' | 'speed' | 'other';
export const CATEGORY_STYLE: Record<FocusCategory, { name: string; icon: string; color: string; order: number }> = {
  biking: { name: 'Biking', icon: 'directions_bike', color: '#4EDAC5', order: 0 },
  running: { name: 'Running', icon: 'directions_run', color: '#79B5FF', order: 1 },
  walking: { name: 'Walk / Hike', icon: 'hiking', color: '#E3E8EE', order: 2 },
  soccer: { name: 'Soccer training', icon: 'sports_soccer', color: '#D1F36B', order: 3 },
  core: { name: 'Core', icon: 'sports_gymnastics', color: '#FFA878', order: 4 },
  gym: { name: 'Gym work', icon: 'fitness_center', color: '#FF80AD', order: 5 },
  hiit: { name: 'HIIT', icon: 'local_fire_department', color: '#FF6B6B', order: 6 },
  yoga: { name: 'Yoga', icon: 'self_improvement', color: '#C7ACF7', order: 7 },
  speed: { name: 'Speed', icon: 'bolt', color: '#FFE17B', order: 8 },
  other: { name: 'Other', icon: 'grid_view', color: '#9AA5AE', order: 9 },
};
const DOMAIN_NAME: Record<string, string> = {
  ballMastery: 'Ball mastery', dribbling: 'Dribbling', passing: 'Passing', receiving: 'Receiving', shooting: 'Shooting',
  speed: 'Speed', agility: 'Agility', plyometrics: 'Plyometrics', strength: 'Strength', games: 'Games',
};

/** `TrainingFocusBuilder.category(row:type:)`. Core exercises are recognized by their COR- catalog ids. */
export function focusCategory(domainId: string, drillId: string, type?: string | null): FocusCategory {
  const domain = domainFromLegacy(domainId || '');
  if (domainId === 'yoga' || type === 'yoga') return 'yoga';
  if (['speed', 'agility', 'plyometrics'].includes(domain)) return 'speed';
  if (['ballMastery', 'dribbling', 'passing', 'receiving', 'shooting', 'games'].includes(domain)) return 'soccer';
  if (type === 'gym') return 'gym';
  if (type === 'hiit') return 'hiit';
  if (/^COR-/.test(drillId || '') || type === 'core') return 'core';
  if (domain === 'strength') return 'gym';
  if (type === 'fitness') return 'speed';
  return 'other';
}

/** "14h 20m", "48m", "2h"; "—" without data (`TrainingDurationFormat.short`). */
export function durationShort(seconds: number, hasData = true): string {
  if (!hasData) return '—';
  const minutes = Math.floor((Math.max(seconds, 0) + 30) / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
/** "48 minutes", "1 hour 5 minutes" (`TrainingDurationFormat.spoken`). */
export function durationSpoken(seconds: number): string {
  const minutes = Math.floor((Math.max(seconds, 0) + 30) / 60), hours = Math.floor(minutes / 60), rest = minutes % 60;
  const hourText = hours === 1 ? '1 hour' : `${hours} hours`, minuteText = rest === 1 ? '1 minute' : `${rest} minutes`;
  if (hours === 0) return minuteText;
  return rest === 0 ? hourText : `${hourText} ${minuteText}`;
}

export type FocusRow = { title: string; seconds: number };
export type FocusSection = { id: string; title: string; note: string; rows: FocusRow[] };
export type FocusStats = { workoutsCompleted: number; secondsTrained: number; categorySeconds: Partial<Record<FocusCategory, number>>; details: Partial<Record<FocusCategory, FocusSection[]>>; incompleteActiveSessions: number };
export type FocusSummary = { periods: Record<Period, FocusStats>; favoriteCategory: FocusCategory | null; timeBasis: TimeBasis };

const credited = (row: Row) => row.status === 'done' || row.status === 'partial';
const safeSeconds = (value: number) => Number.isFinite(value) && value > 0 ? Math.floor(Math.min(value, 31 * 86400)) : 0;

/** The snapshot block a log row belongs to. Personal workout rows carry no domain or estimate. */
function snapshotBlock(log: Row, row: Row): Row {
  return (log.workoutSnapshot?.blocks || []).find((b: Row) => b.blockId === row.blockId) || {};
}
const rowDomain = (log: Row, row: Row) => String(row.domain || snapshotBlock(log, row).domain || '');
const rowEstimate = (log: Row, row: Row) => Math.max(0, Number(row.estimatedMinutes ?? snapshotBlock(log, row).estimatedMinutes) || 0);

/** `TrainingStatsBuilder.blockSeconds`: measured time capped, else the estimate (half for partial work). */
export function blockSeconds(log: Row, row: Row): { seconds: number; measured: boolean } {
  const estimate = rowEstimate(log, row);
  const elapsed = Number(row.elapsedSeconds);
  if (Number.isFinite(elapsed) && elapsed > 0) {
    const cap = estimate > 0 ? Math.max(2 * estimate * 60, estimate * 60 + 900) : 90 * 60;
    return { seconds: Math.min(Math.floor(elapsed), cap), measured: true };
  }
  if (!credited(row)) return { seconds: 0, measured: false };
  return { seconds: (row.status === 'done' ? estimate : Math.floor(estimate / 2)) * 60, measured: false };
}

const recordedWork = (row: Row): number | null => {
  if (Number.isFinite(Number(row.workSeconds)) && row.workSeconds !== null && row.workSeconds !== undefined) return safeSeconds(Number(row.workSeconds));
  const values = (Array.isArray(row.sets) ? row.sets : []).map((s: Row) => Number(s?.workSeconds)).filter(Number.isFinite);
  return values.length ? safeSeconds(values.reduce((a: number, b: number) => a + Math.max(0, b), 0)) : null;
};

/** Splits `total` across weights; the last key takes the remainder so the parts add up exactly. */
function apportioned(total: number, weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights).filter(([, v]) => v > 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  const result: Record<string, number> = {};
  let allocated = 0;
  entries.forEach(([key, value], index) => {
    const share = index === entries.length - 1 ? total - allocated : Math.floor(total * value / sum);
    result[key] = share; allocated += share;
  });
  return result;
}

/** `TrainingFocusBuilder.blockTimes`: the session clock (`activeSeconds`) shared across the rows. */
export function blockTimes(log: Row, basis: TimeBasis): Record<string, { seconds: number; measured: boolean }> {
  const weights: Record<string, number> = {}, measured: Record<string, boolean> = {};
  for (const row of log.blocks || []) {
    const old = blockSeconds(log, row), work = recordedWork(row);
    if (!(credited(row) || old.seconds > 0 || (work ?? 0) > 0)) continue;
    if (basis === 'active') { if (work !== null) { weights[row.blockId] = work; measured[row.blockId] = true; } }
    else { weights[row.blockId] = Math.max(old.seconds, work ?? 0); measured[row.blockId] = old.measured; }
  }
  const keys = Object.keys(weights);
  if (!keys.length) return {};
  const sum = safeSeconds(Object.values(weights).reduce((a, b) => a + b, 0));
  const clockValue = Number(log.activeSeconds);
  const clock = Number.isFinite(clockValue) && log.activeSeconds !== null && log.activeSeconds !== undefined ? safeSeconds(clockValue) : null;
  const total = basis === 'total' ? (clock ?? sum) : Math.min(sum, clock ?? sum);
  if (basis === 'total' && sum === 0) for (const key of keys) weights[key] = 1;
  if (total <= 0) return {};
  const allocated = apportioned(total, weights);
  return Object.fromEntries(Object.entries(allocated).map(([key, seconds]) => [key, { seconds, measured: basis === 'active' || clock !== null || measured[key] === true }]));
}

const hasMissingWorkTiming = (log: Row) => (log.blocks || []).some((row: Row) => {
  if (!credited(row)) return false;
  if (recordedWork(row) === null) return true;
  const sets = Array.isArray(row.sets) ? row.sets : [];
  return sets.length ? sets.length < Number(row.setsCompleted || 0) || sets.some((s: Row) => s?.workSeconds === null || s?.workSeconds === undefined) : false;
});

/** Ended logs, unique by id with the last copy winning (`TrainingStatsBuilder.countedLogs`). */
export function countedLogs(logs: Row[]): Row[] {
  const latest = new Map<string, Row>();
  for (const log of logs) { const id = String(log.id ?? ''); latest.delete(id); latest.set(id, log); }
  return [...latest.values()].filter(log => !!log.endedAt);
}

const SECTION_WORDS: Partial<Record<FocusCategory, [string, string]>> = {
  soccer: ['Skills trained', 'Your soccer work, grouped by the recorded drill category.'],
  speed: ['Speed & athleticism', 'Speed, agility and plyometrics together, with each focus shown separately.'],
  core: ['Core work', 'Stability holds and dynamic strength from completed core exercises.'],
  gym: ['Exercises', 'Completed strength work, using saved exercise names where available.'],
  hiit: ['Exercises', 'Completed interval work, using saved exercise names where available.'],
};

function compactRows(rows: Record<string, number>): FocusRow[] {
  const sorted = Object.entries(rows).filter(([, v]) => v > 0).sort(([a, x], [b, y]) => x === y ? (a < b ? -1 : 1) : y - x);
  const visible = sorted.slice(0, 7).map(([title, seconds]) => ({ title, seconds }));
  return sorted.length > 7 ? [...visible, { title: 'Other focus', seconds: sorted.slice(7).reduce((a, [, v]) => a + v, 0) }] : visible;
}

/**
 * `TrainingFocusBuilder.summary`, for workout logs (the web records no runs or rides). Periods are
 * the device calendar's week (Sunday start, as `Calendar.current` in the US), month and year.
 */
export function focusSummary(logs: Row[], now = new Date(), basis: TimeBasis = 'total'): FocusSummary {
  const counted = countedLogs(logs).filter(log => millis(log.startedAt) <= now.getTime());
  type Entry = { date: number; category: FocusCategory; seconds: number; focus: Record<string, number> };
  const entries: Entry[] = [];
  for (const log of counted) {
    const timing = blockTimes(log, basis), type = log.workoutSnapshot?.workoutType ?? log.workoutType;
    for (const row of log.blocks || []) {
      const time = timing[row.blockId];
      if (!time || time.seconds <= 0) continue;
      const domainId = rowDomain(log, row), category = focusCategory(domainId, String(row.drillId || ''), type);
      const block = snapshotBlock(log, row);
      let focus: Record<string, number>;
      if (category === 'soccer' || category === 'speed') {
        const domain = domainFromLegacy(domainId);
        focus = { [DOMAIN_NAME[domain] || 'Other training']: time.seconds };
      } else focus = { [String(block.name || row.drillId || 'Unspecified exercise')]: time.seconds };
      entries.push({ date: millis(log.startedAt), category, seconds: time.seconds, focus });
    }
  }
  const start = (period: Period): number | null => {
    if (period === 'allTime') return null;
    const day = new Date(now.getFullYear(), now.getMonth(), period === 'week' ? now.getDate() - now.getDay() : 1);
    if (period === 'year') day.setMonth(0, 1);
    return day.getTime();
  };
  const end = (period: Period): number | null => {
    const from = start(period);
    if (from === null) return null;
    const day = new Date(from);
    if (period === 'week') day.setDate(day.getDate() + 7); else if (period === 'month') day.setMonth(day.getMonth() + 1); else day.setFullYear(day.getFullYear() + 1);
    return day.getTime();
  };
  const fold = (period: Period): FocusStats => {
    const from = start(period), to = end(period);
    const includes = (date: number) => from === null || (date >= from && date < (to as number));
    const seconds: Partial<Record<FocusCategory, number>> = {}, axes: Partial<Record<FocusCategory, Record<string, number>>> = {};
    for (const entry of entries.filter(e => includes(e.date))) {
      seconds[entry.category] = (seconds[entry.category] || 0) + entry.seconds;
      const rows = axes[entry.category] || (axes[entry.category] = {});
      for (const [label, value] of Object.entries(entry.focus)) rows[label] = (rows[label] || 0) + value;
    }
    const details: Partial<Record<FocusCategory, FocusSection[]>> = {};
    for (const [category, rows] of Object.entries(axes) as [FocusCategory, Record<string, number>][]) {
      const [title, note] = SECTION_WORDS[category] || ['Recorded work', 'Older work without a recognized category is preserved here.'];
      details[category] = [{ id: 'focus', title, note, rows: compactRows(rows) }];
    }
    const inPeriod = counted.filter(log => includes(millis(log.startedAt)));
    return {
      workoutsCompleted: inPeriod.filter(log => (log.blocks || []).some(credited)).length,
      secondsTrained: Object.values(seconds).reduce((a, b) => a + (b || 0), 0), categorySeconds: seconds, details,
      incompleteActiveSessions: basis === 'active' ? inPeriod.filter(hasMissingWorkTiming).length : 0,
    };
  };
  const periods = Object.fromEntries(PERIODS.map(p => [p, fold(p)])) as Record<Period, FocusStats>;
  const favorite = focusSlices(periods.allTime).filter(s => s.category !== 'other')
    .sort((a, b) => a.seconds === b.seconds ? CATEGORY_STYLE[a.category].order - CATEGORY_STYLE[b.category].order : b.seconds - a.seconds)[0];
  return { periods, favoriteCategory: favorite?.category ?? null, timeBasis: basis };
}

export type FocusSlice = { category: FocusCategory; seconds: number };
export type FocusArc = FocusSlice & { start: number; end: number; fraction: number };
export function focusSlices(stats: FocusStats): FocusSlice[] {
  return (Object.entries(stats.categorySeconds) as [FocusCategory, number][]).filter(([, s]) => s > 0)
    .map(([category, seconds]) => ({ category, seconds })).sort((a, b) => CATEGORY_STYLE[a.category].order - CATEGORY_STYLE[b.category].order);
}
/** Slices laid end to end from 12 o'clock, clockwise, spanning exactly one turn (`DomainDonutGeometry.arcs`). */
export function focusArcs(slices: FocusSlice[]): FocusArc[] {
  const total = slices.reduce((a, s) => a + Math.max(s.seconds, 0), 0);
  if (total <= 0) return [];
  let running = 0;
  return slices.map((slice, index) => {
    const start = 2 * Math.PI * running / total;
    running += Math.max(slice.seconds, 0);
    const end = index === slices.length - 1 ? 2 * Math.PI : 2 * Math.PI * running / total;
    return { ...slice, start, end, fraction: Math.max(slice.seconds, 0) / total };
  });
}
export const percent = (fraction: number) => Math.round(Math.max(fraction, 0) * 100);

/** "2h 15m trained · 4 workouts this week". */
export function breakdownHeadline(stats: FocusStats, period: Period): string {
  const workouts = stats.workoutsCompleted === 1 ? '1 workout' : `${stats.workoutsCompleted} workouts`;
  return `${durationShort(stats.secondsTrained)} trained · ${workouts} ${PERIOD_CAPTION[period]}`;
}
export const breakdownEmptyText = (period: Period) => period === 'allTime' ? 'No training yet' : `No training yet ${PERIOD_CAPTION[period]}`;

// MARK: - Resume, saved workouts and the plan card

export type ResumeTarget = { kind: 'plan' | 'adhoc' | 'personal'; workout: Row; log: Row; title: string; drillNumber: number; drillCount: number };

export const resumeBannerText = (target: ResumeTarget) => {
  const quoted = `Resume “${target.title}”`;
  return target.drillCount > 0 ? `${quoted} · drill ${target.drillNumber} of ${target.drillCount}` : quoted;
};

function resumeTarget(kind: ResumeTarget['kind'], log: Row, workout: Row): ResumeTarget {
  const snapshot = log.workoutSnapshot || workout;
  const blocks: Row[] = snapshot.blocks || workout.blocks || [];
  const accounted = blocks.filter(b => (log.blocks || []).some((r: Row) => r.blockId === b.blockId && (r.status === 'done' || r.status === 'skipped'))).length;
  return { kind, workout, log, title: snapshot.title || workout.title || 'your workout', drillNumber: Math.min(accounted + 1, blocks.length), drillCount: blocks.length };
}

/**
 * The newest unfinished workout that can still be opened (`TrainingResumeTarget.find`): a slot of the
 * active plan under its canonical log id, a saved ad-hoc workout, or (web) a personal workout.
 */
export function findResume(plan: Row | null, logs: Row[], saved: Row[], personalWorkouts: Row[] = [], personalLogs: Record<string, Row> = {}): ResumeTarget | null {
  const open = [
    ...logs.filter(l => !l.endedAt).map(l => ({ log: l, personal: false })),
    ...Object.values(personalLogs).filter(l => !l.endedAt).map(l => ({ log: l, personal: true })),
  ].sort((a, b) => (millis(b.log.startedAt) || 0) - (millis(a.log.startedAt) || 0) || String(b.log.id ?? b.log.workoutId).localeCompare(String(a.log.id ?? a.log.workoutId)));
  for (const { log, personal } of open) {
    if (personal) {
      const workout = personalWorkouts.find(w => w.workoutId === log.workoutId);
      if (workout) return resumeTarget('personal', log, workout);
      continue;
    }
    if (log.source === 'plan' && plan && log.planId === plan.id && log.id === planLogId(plan.id, log.workoutId)) {
      for (const week of [...(plan.weeks || [])].sort((a: Row, b: Row) => a.weekNumber - b.weekNumber)) {
        const workout = (week.workouts || []).find((w: Row) => w.workoutId === log.workoutId);
        if (workout) return resumeTarget('plan', log, { ...workout, weekNumber: week.weekNumber });
      }
    }
    if (log.source !== 'plan') {
      const workout = saved.find(w => w.id === log.id);
      if (workout) return resumeTarget('adhoc', log, workout);
    }
  }
  return null;
}

/** Inside the workout's plan week, by the plan's own timezone. */
export function inWeekWindow(plan: Row | null, weekNumber: number, now = new Date()): boolean {
  const window = plan && weekWindow(plan, Number(weekNumber));
  if (!window) return false;
  const day = localDayString(now, plan!.timezone);
  return day >= window.start && day < window.end;
}

/**
 * The active plan's ad-hoc workouts that can still be started or resumed, newest first
 * (`SavedWorkoutsSection.savedWorkouts`). A missing `source` counts as ad hoc: these documents come
 * from the ad-hoc collection for the plan.
 */
export function savedWorkouts(planWorkouts: Row[], logs: Record<string, Row>, plan: Row | null, now = new Date()): Row[] {
  return planWorkouts.filter(w => {
    if ((w.source ?? 'adhoc') !== 'adhoc') return false;
    const log = logs[w.id];
    if (log) return !log.endedAt;
    return inWeekWindow(plan, w.weekNumber, now);
  }).sort((a, b) => (millis(b.generatedAt) || 0) - (millis(a.generatedAt) || 0) || String(b.id).localeCompare(String(a.id)));
}

/** "Week 3 of 6 · 2 saved"; the saved count is left out at zero. */
export function planCardSubtitle(currentWeek: number, horizonWeeks: number, savedCount: number) {
  const week = `Week ${currentWeek} of ${Math.max(horizonWeeks, currentWeek)}`;
  return savedCount > 0 ? `${week} · ${savedCount} saved` : week;
}

export type SavedEntry = { id: string; source: 'adhoc' | 'personal'; workout: Row; inProgress: boolean; unavailableReason: string | null; type: string };
export const WORKOUT_TYPE_LABELS: Record<string, string> = { field: 'On field', gym: 'Gym', core: 'Core', hiit: 'HIIT', fitness: 'Fitness', yoga: 'Yoga' };

/**
 * `SavedWorkoutEntry.entries` for the web's two kinds of saved workout: the active plan's ad-hoc
 * workouts and the athlete's personal workouts. A finished ad-hoc workout belongs to History; a
 * finished personal workout stays listed so an edited copy can be made, as the app's on-device ones do.
 */
export function savedEntries(adhoc: Row[], adhocLogs: Record<string, Row>, personal: Row[], personalLogs: Record<string, Row>, plan: Row | null, now = new Date()): SavedEntry[] {
  const type = (w: Row) => String(w.workoutSnapshot?.workoutType ?? w.workoutType ?? w.params?.workoutType ?? 'field');
  const entries: SavedEntry[] = [];
  for (const w of adhoc) {
    if ((w.source ?? 'adhoc') !== 'adhoc') continue;
    const log = adhocLogs[w.id];
    if (log?.endedAt) continue;
    const inProgress = !!log;
    const reason = !inProgress && !(plan && w.planId === plan.id && inWeekWindow(plan, w.weekNumber, now)) ? 'From an earlier training week. Create a new workout for your current plan.' : null;
    entries.push({ id: `cloud:${w.id}`, source: 'adhoc', workout: w, inProgress, unavailableReason: reason, type: type(w) });
  }
  for (const w of personal) {
    const log = personalLogs[w.workoutId];
    entries.push({ id: `personal:${w.workoutId}`, source: 'personal', workout: w, inProgress: !!log && !log.endedAt,
      unavailableReason: log?.endedAt ? 'Completed · create an edited copy to practice again.' : null, type: type(w) });
  }
  const sortTime = (e: SavedEntry) => millis(e.workout.generatedAt ?? e.workout.createdAt ?? e.workout.scheduledDate) || 0;
  return entries.sort((a, b) => sortTime(b) - sortTime(a) || b.id.localeCompare(a.id));
}

/** "4 drills · ~30 min · In progress". */
export function savedDetailLine(workout: Row, inProgress: boolean) {
  const count = (workout.blocks || []).length;
  const base = `${count === 1 ? '1 drill' : `${count} drills`} · ~${workout.estimatedMinutes ?? 0} min`;
  return inProgress ? `${base} · In progress` : base;
}

// MARK: - Plan page

/** `TrainingHubPlanPage.content`: an active V3 plan, or from Stats any active plan. */
export function planPagePlan(plan: Row | null, fromStats: boolean): Row | null {
  if (!plan || plan.status !== 'active') return null;
  return plan.schemaVersion === 3 || fromStats ? plan : null;
}

export type PlanSection = 'weekRail' | 'weekCard' | 'nextWorkout' | 'legacyWorkout' | 'targets' | 'drills' | 'links' | 'freeSession';
/** `MyWorkoutPlanSection.sections` (the empty saved-workouts slot is left out). */
export function planSections(isV3: boolean, isCurrentWeek: boolean): PlanSection[] {
  if (isV3) return ['weekRail', 'weekCard', 'nextWorkout', 'targets', 'drills', 'links', 'freeSession'];
  return ['weekRail', 'weekCard', ...(isCurrentWeek ? ['legacyWorkout' as const] : []), 'targets', 'drills', 'links', 'freeSession'];
}

/** Days left in the plan week, counting today (`TrainingPlan.daysLeftInWeek`). */
export function daysLeftInWeek(plan: Row, weekNumber: number, now = new Date()): number {
  const window = weekWindow(plan, weekNumber);
  if (!window) return 0;
  const today = localDayString(now, plan.timezone);
  const day = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  return Math.max(0, Math.round((day(window.end) - day(today)) / 86400000));
}

/** "Aug 3 – Aug 9" for a half-open week window. */
export function windowLabel(plan: Row, weekNumber: number): string | null {
  const window = weekWindow(plan, weekNumber);
  if (!window) return null;
  const format = (value: string, offset = 0) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)) + offset)));
  return `${format(window.start)} – ${format(window.end, -1)}`;
}

export const planWeekNumber = (plan: Row, now = new Date()) => currentWeekNumber(plan, now);
export const planWeeks = (plan: Row) => planHorizonWeeks(plan);

// MARK: - History

/** "3 of 4 done · 1 partial · 1 skipped" (`TrainingHistoryView.blockSummary`). */
export function historyBlockSummary(log: Row): string {
  const blocks: Row[] = log.blocks || [];
  if (!blocks.length) return 'No blocks logged.';
  const done = blocks.filter(b => b.status === 'done').length, partial = blocks.filter(b => b.status === 'partial').length, skipped = blocks.filter(b => b.status === 'skipped').length;
  const parts = [`${done} of ${blocks.length} done`];
  if (partial) parts.push(`${partial} partial`);
  if (skipped) parts.push(`${skipped} skipped`);
  return parts.join(' · ');
}

export function endReasonChip(log: Row): { text: string; tone: 'accent' | 'warn' | 'muted' } {
  if (!log.endedAt) return { text: 'In progress', tone: 'muted' };
  if (log.endReason === 'completed') return { text: 'Completed', tone: 'accent' };
  if (log.endReason === 'abandoned') return { text: 'Abandoned', tone: 'muted' };
  return { text: 'Ended early', tone: 'warn' };
}

const FREE_SESSION_DRILLS: Record<string, string> = { jump: 'Jump', sprint: 'Sprint', deadballShot: 'Shoot', broadJump: 'Broad Jump', dribbling: 'Dribbling', changeOfDirection: 'COD', freeRecord: 'Free' };
/** "Sprint · Dribbling" (`TrainingSessionSummary.drillSummaryLine`). */
export function freeSessionSummary(session: Row): string {
  const refs: Row[] = [...(session.sessionRefs || [])].sort((a, b) => (millis(a.addedAt) || 0) - (millis(b.addedAt) || 0));
  const labels = refs.map(r => FREE_SESSION_DRILLS[r.drillType] || String(r.drillType || '').replace(/^./, c => c.toUpperCase()));
  return labels.length ? labels.join(' · ') : 'No drills yet';
}

/** "Nov 11, 2026 at 4:05 PM" — the app's medium date and short time. */
export function sessionDateText(value: any): string {
  const time = millis(value);
  if (!Number.isFinite(time)) return 'Recently';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time));
}

/** Workout logs and free sessions in one list, newest first, each id once. */
export function historyRows(logs: Row[], sessions: Row[]): { kind: 'workout' | 'session'; row: Row; key: string }[] {
  const seen = new Set<string>();
  return [...logs.map(row => ({ kind: 'workout' as const, row, key: `workout-${row.id}` })), ...sessions.map(row => ({ kind: 'session' as const, row, key: `session-${row.id}` }))]
    .filter(item => !seen.has(item.key) && !!seen.add(item.key))
    .sort((a, b) => (millis(b.row.startedAt) || 0) - (millis(a.row.startedAt) || 0) || b.key.localeCompare(a.key));
}

/**
 * Sample finished workouts for the preview route, from an earlier plan so they never occupy a slot of
 * the sample plan. They feed the stats row, the breakdown and History; nothing is written.
 */
export function previewHistory(now = new Date()): Row[] {
  const at = (days: number, hour: number) => { const d = new Date(now); d.setDate(d.getDate() - days); d.setHours(hour, 0, 0, 0); return d; };
  const block = (blockId: string, drillId: string, name: string, domain: string, minutes: number) => ({ blockId, drillId, name, domain, estimatedMinutes: minutes, sets: 3 });
  const snapshot = (title: string, blocks: Row[]) => ({ title, blocks, estimatedMinutes: blocks.reduce((a, b) => a + b.estimatedMinutes, 0) });
  const one = [block('b1', 'DRB-005', 'Cone maze', 'dribbling', 14), block('b2', 'PAS-001', 'Wall pass rhythm', 'passing', 12), block('b3', 'SPD-002', 'Flying 10s', 'speed', 8)];
  const two = [block('b1', 'SHO-003', 'Finishing ladder', 'shooting', 15), block('b2', 'AGI-004', 'Box turns', 'agility', 10)];
  const row = (b: Row, status: string, sets: number) => ({ blockId: b.blockId, drillId: b.drillId, domain: b.domain, status, setsCompleted: sets, targetSets: 3, estimatedMinutes: b.estimatedMinutes });
  return [
    { id: 'preview-earlier-plan_w5s2', planId: 'preview-earlier-plan', source: 'plan', workoutId: 'w5s2', weekNumber: 5, schemaVersion: 2, startedAt: at(1, 17), endedAt: at(1, 18), endReason: 'completed', activeSeconds: 2100,
      workoutSnapshot: snapshot('Close control circuit', one), blocks: [row(one[0], 'done', 3), row(one[1], 'done', 3), row(one[2], 'done', 3)] },
    { id: 'preview-earlier-plan_w4s1', planId: 'preview-earlier-plan', source: 'plan', workoutId: 'w4s1', weekNumber: 4, schemaVersion: 2, startedAt: at(9, 16), endedAt: at(9, 17), endReason: 'endedEarly', activeSeconds: 1260,
      workoutSnapshot: snapshot('Finish and turn', two), blocks: [row(two[0], 'done', 3), row(two[1], 'skipped', 1)] },
  ];
}

/** "In 2 workouts this week · dose shown in each workout". */
export function weekDrillLine(week: Row, drillId: string) {
  const count = (week?.workouts || []).filter((w: Row) => (w.blocks || []).some((b: Row) => b.drillId === drillId)).length;
  return `In ${count} workout${count === 1 ? '' : 's'} this week · dose shown in each workout`;
}
