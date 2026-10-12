import { isContinuousUnit } from '../../../lib/contracts/types';
import { reconcileClock, restSeconds, stopRest } from './clock';
import type { Clock } from './clock';
import type { Row } from './execution';

export type RestKind = 'reps' | 'sets';
export type RestChoice = Partial<Record<RestKind, number>>;
export type RestChoices = Record<string, RestChoice>;
const seconds = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
export function restDefaults(block: Row): Record<RestKind, number> {
  const betweenReps = block.restScope === 'reps' && !isContinuousUnit(block.repUnit);
  return { reps: betweenReps ? seconds(block.restSeconds) : 0,
    sets: seconds(betweenReps ? block.restBetweenSetsSeconds : block.restSeconds) };
}
export function chosenRest(block: Row, choice: RestChoice | undefined, kind: RestKind): number {
  const prescribed = restDefaults(block)[kind], value = choice?.[kind];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= prescribed ? value : prescribed;
}
export function restoreRestChoices(value: unknown, blocks: Row[]): RestChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(blocks.flatMap(block => {
    const raw = (value as RestChoices)[block.blockId];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const defaults = restDefaults(block);
    const choice = Object.fromEntries((['reps', 'sets'] as const).flatMap(kind => {
      const n = raw[kind];
      return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= defaults[kind] ? [[kind, n]] : [];
    }));
    return Object.keys(choice).length ? [[block.blockId, choice]] : [];
  }));
}
export function startRestTimer(clock: Clock, duration: number, now: number, kind: RestKind): Clock {
  const c = reconcileClock(clock, now);
  if (duration <= 0) return stopRest(c);
  return { ...c, restTotal: duration, restKind: kind,
    restUntil: c.runningSince === null ? null : now + duration * 1000,
    frozenRest: c.runningSince === null ? duration : null };
}
export function resizeRestTimer(clock: Clock, duration: number, now: number, kind: RestKind): Clock {
  const c = reconcileClock(clock, now);
  if (restSeconds(c, now) <= 0 || (c.restKind ?? 'sets') !== kind) return c;
  const remaining = c.frozenRest ?? Math.max(0, ((c.restUntil ?? now) - now) / 1000);
  const elapsed = Math.max(0, (c.restTotal ?? remaining) - remaining);
  const next = Math.max(0, duration - elapsed);
  return next === 0 ? stopRest(c) : { ...c, restTotal: duration,
    restUntil: c.runningSince === null ? null : now + next * 1000,
    frozenRest: c.runningSince === null ? next : null };
}
