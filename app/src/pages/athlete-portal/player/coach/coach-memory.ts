import type { Row } from '../execution';

/** One coach memory as the app reads it (`CoachMemoryRecord.parse`). Anything else is ignored. */
export type CoachMemoryRecord = { id: string; category: string; text: string; sourceQuote: string; status: 'active' | 'proposed'; expiresAt: number | null };

export const MEMORY_LIMIT = 24;

function expiry(value: unknown): number | null {
  if (value && typeof (value as Row).toMillis === 'function') return (value as Row).toMillis();
  if (typeof value === 'string') { const time = Date.parse(value); return Number.isFinite(time) ? time : null; }
  return null;
}

export function parseCoachMemory(fields: Row): CoachMemoryRecord | null {
  const id = fields?.memoryId;
  if (typeof id !== 'string' || !id) return null;
  if (!['goal', 'preference', 'training_constraint'].includes(fields.category)) return null;
  if (typeof fields.text !== 'string' || !fields.text.trim()) return null;
  if (!['proposed', 'active'].includes(fields.status)) return null;
  return { id, category: fields.category, text: fields.text, sourceQuote: typeof fields.sourceQuote === 'string' ? fields.sourceQuote : '',
    status: fields.status, expiresAt: expiry(fields.expiresAt) };
}

/**
 * The saved and suggested memories on screen. As in the app (`isCurrent`), a memory without an
 * expiry is not current: the gateway always writes one, so a missing expiry is a malformed row.
 */
export function coachMemories(snapshot: Row | null, now = Date.now()) {
  const records = (Array.isArray(snapshot?.memories) ? snapshot!.memories : [])
    .map(parseCoachMemory).filter((record: CoachMemoryRecord | null): record is CoachMemoryRecord => !!record)
    .sort((a: CoachMemoryRecord, b: CoachMemoryRecord) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const current = (record: CoachMemoryRecord) => record.expiresAt !== null && record.expiresAt > now;
  return {
    active: records.filter((record: CoachMemoryRecord) => record.status === 'active' && current(record)),
    proposed: records.filter((record: CoachMemoryRecord) => record.status === 'proposed' && current(record)),
  };
}

/** A gateway memory snapshot the app would accept (`CoachMemoryStore.applyWorkspace`). */
export function memoryLoaded(snapshot: Row | null): boolean {
  const workspace = snapshot?.workspace;
  return !!workspace && Number.isInteger(workspace.revision) && typeof workspace.enabled === 'boolean';
}
