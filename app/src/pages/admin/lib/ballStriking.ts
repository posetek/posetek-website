// Readable, allowlisted audit projections. Never render arbitrary run/provider maps.
export interface TechniqueFocus { id: string; label: string; evidenceIds: string[]; sourceRepIds: string[] }
export interface TechniquePriorRep { repId: string; ordinal: number; cue: string; evidenceIds: string[]; resultSummary: string; qualityNotes: string[] }
export interface TechniqueSessionSummary {
  sessionId: string; playerId: string; playerDisplayName: string | null; actorUid: string; status: "active" | "ended";
  goal: string; reference: { referenceId: string; versionId: string; title: string } | null;
  revision: number; repCount: number; createdAt: string; updatedAt: string; endedAt: string | null;
}
export interface TechniqueMemory {
  schemaVersion: 1; goal: string; focuses: TechniqueFocus[];
  recentReps: TechniquePriorRep[];
  trendSummary: string;
}
export interface TechniqueEvidence {
  id: string; label: string; athlete: number | null; reference: number | null;
  units: string | null; qualityNotes: string[];
}
export interface TechniqueAuditTurn {
  requestId: string; kind: "rep" | "chat" | "end"; ordinal: number | null; repId: string | null;
  createdAt: string; status: "complete" | "failed" | "uncertain";
  input: { goal: string; referenceTitle: string; memoryRevision: number; focuses: TechniqueFocus[]; message: string | null;
    recentReps?: TechniquePriorRep[]; recentChat?: { user: string; assistant: string }[] };
  tools: { name: string; section: string | null; phase: string | null; availableCount: number; returnedCount: number; evidence: TechniqueEvidence[] }[];
  decisionSummary: string; spokenOutput: string; qualityNotes: string[];
  model: { id: "claude-opus-5-5"; provider: "anthropic_direct"; effort: "medium" };
  latencyMs: number; error: { code: string; message: string } | null;
}
export interface TechniqueSessionPage { schemaVersion: 1; sessions: TechniqueSessionSummary[]; nextCursor: string | null }
export interface TechniqueSessionDetail {
  schemaVersion: 1; session: TechniqueSessionSummary & { memory: TechniqueMemory };
  turns: TechniqueAuditTurn[]; nextCursor: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// eslint-disable-next-line no-control-regex -- Reject path separators and control bytes in document IDs.
const DOC_ID = /^[^/\u0000-\u001f\u007f]{1,180}$/;
export const validTechniqueId = (value: string) => UUID.test(value);
export const validTechniquePlayerId = (value: string) => DOC_ID.test(value) && value !== "." && value !== "..";
const invalid = (): never => { throw new Error("Session records could not be verified. Refresh to try again."); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
  return typeof value === "string" && value.length <= max && (!required || value.trim().length > 0) ? value : invalid();
}
function id(value: unknown): string { const result = text(value, 36, true); return validTechniqueId(result) ? result : invalid(); }
function playerId(value: unknown): string { const result = text(value, 180, true); return validTechniquePlayerId(result) ? result : invalid(); }
function integer(value: unknown, min = 0): number { return Number.isSafeInteger(value) && Number(value) >= min ? value as number : invalid(); }
function date(value: unknown): string {
  const result = text(value, 40, true);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(result) || !Number.isFinite(Date.parse(result))) return invalid();
  return new Date(result).toISOString().slice(0, 19) === result.slice(0, 19) ? result : invalid();
}
// JavaScript Date truncates microseconds; preserve Backend's full ordering precision.
const dateOrder = (value: string) => value.slice(0, 19) + "." + (value.match(/\.(\d+)/)?.[1] || "").padEnd(6, "0");
function nullable<T>(value: unknown, parse: (entry: unknown) => T): T | null { return value === null ? null : parse(value); }
function list<T>(value: unknown, max: number, parse: (entry: unknown) => T): T[] {
  return Array.isArray(value) && value.length <= max ? value.map(parse) : invalid();
}
function strings(value: unknown, max: number, length = 300): string[] { return list(value, max, entry => text(entry, length, true)); }
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  return typeof value === "string" && choices.includes(value as T) ? value as T : invalid();
}
function schema(value: unknown) { if (value !== 1) invalid(); }
function focus(value: unknown): TechniqueFocus {
  const data = record(value);
  return { id: text(data.id, 64, true), label: text(data.label, 120, true),
    evidenceIds: strings(data.evidenceIds, 12, 200), sourceRepIds: list(data.sourceRepIds, 6, playerId) };
}
function summary(value: unknown): TechniqueSessionSummary {
  const data = record(value);
  return { sessionId: id(data.sessionId), playerId: playerId(data.playerId), playerDisplayName: data.playerDisplayName == null ? null : text(data.playerDisplayName, 120, true), actorUid: text(data.actorUid, 128, true),
    status: choice(data.status, ["active", "ended"]), goal: text(data.goal, 300),
    reference: nullable(data.reference, value => {
      const reference = record(value);
      return { referenceId: id(reference.referenceId), versionId: id(reference.versionId), title: text(reference.title, 80, true) };
    }),
    revision: integer(data.revision), repCount: integer(data.repCount), createdAt: date(data.createdAt), updatedAt: date(data.updatedAt),
    endedAt: nullable(data.endedAt, date) };
}
function priorRep(value: unknown): TechniquePriorRep {
  const rep = record(value);
  return { repId: playerId(rep.repId), ordinal: integer(rep.ordinal, 1), cue: text(rep.cue, 240, true),
    evidenceIds: strings(rep.evidenceIds, 12, 200), resultSummary: text(rep.resultSummary, 300), qualityNotes: strings(rep.qualityNotes, 6) };
}
function memory(value: unknown): TechniqueMemory {
  const data = record(value); schema(data.schemaVersion);
  return { schemaVersion: 1, goal: text(data.goal, 300), focuses: list(data.focuses, 2, focus),
    recentReps: list(data.recentReps, 6, priorRep), trendSummary: text(data.trendSummary, 400) };
}
function measurement(value: unknown): number | null { return value === null ? null : typeof value === "number" && Number.isFinite(value) ? value : invalid(); }
function evidence(value: unknown): TechniqueEvidence {
  const data = record(value);
  return { id: text(data.id, 200, true), label: text(data.label, 200, true), athlete: measurement(data.athlete), reference: measurement(data.reference),
    units: nullable(data.units, value => text(value, 40)), qualityNotes: strings(data.qualityNotes, 6) };
}
function turn(value: unknown): TechniqueAuditTurn {
  const data = record(value), input = record(data.input), model = record(data.model);
  return { requestId: id(data.requestId), kind: choice(data.kind, ["rep", "chat", "end"]),
    ordinal: nullable(data.ordinal, value => integer(value, 1)), repId: nullable(data.repId, playerId), createdAt: date(data.createdAt),
    status: choice(data.status, ["complete", "failed", "uncertain"]),
    input: { goal: text(input.goal, 300), referenceTitle: text(input.referenceTitle, 80), memoryRevision: integer(input.memoryRevision),
      focuses: list(input.focuses, 2, focus), message: nullable(input.message, value => text(value, 1000, true)),
      ...(input.recentReps === undefined ? {} : { recentReps: list(input.recentReps, 6, priorRep) }),
      ...(input.recentChat === undefined ? {} : { recentChat: list(input.recentChat, 6, value => {
        const pair = record(value); return { user: text(pair.user, 1000, true), assistant: text(pair.assistant, 1200, true) };
      }) }) },
    tools: list(data.tools, 8, value => {
      const tool = record(value);
      return { name: text(tool.name, 120, true), section: nullable(tool.section, value => text(value, 120)), phase: nullable(tool.phase, value => text(value, 120)),
        availableCount: integer(tool.availableCount), returnedCount: integer(tool.returnedCount), evidence: list(tool.evidence, 20, evidence) };
    }), decisionSummary: text(data.decisionSummary, 600), spokenOutput: text(data.spokenOutput, 1200), qualityNotes: strings(data.qualityNotes, 6),
    model: { id: choice(model.id, ["claude-opus-5-5"]), provider: choice(model.provider, ["anthropic_direct"]), effort: choice(model.effort, ["medium"]) },
    latencyMs: integer(data.latencyMs), error: nullable(data.error, value => {
      const error = record(value); return { code: text(error.code, 80, true), message: text(error.message, 600, true) };
    }) };
}
function cursor(value: unknown): string | null { return nullable(value, value => text(value, 8000, true)); }
function unique<T>(values: T[], key: (value: T) => string): T[] {
  return new Set(values.map(key)).size === values.length ? values : invalid();
}
export function normalizeTechniqueSessionPage(value: unknown): TechniqueSessionPage {
  const data = record(value); schema(data.schemaVersion);
  return { schemaVersion: 1, sessions: unique(list(data.sessions, 50, summary), row => `${row.playerId}/${row.sessionId}`), nextCursor: cursor(data.nextCursor) };
}
export function normalizeTechniqueSessionDetail(value: unknown, expected: { playerId: string; sessionId: string }): TechniqueSessionDetail {
  const data = record(value); schema(data.schemaVersion);
  const session = summary(data.session);
  if (session.playerId !== expected.playerId || session.sessionId !== expected.sessionId) invalid();
  const turns = unique(list(data.turns, 50, turn), row => row.requestId);
  // The server's stable chronological order is part of the audit contract.
  for (let index = 1; index < turns.length; index++) {
    const before = turns[index - 1], after = turns[index];
    if (dateOrder(before.createdAt) > dateOrder(after.createdAt)
      || dateOrder(before.createdAt) === dateOrder(after.createdAt) && before.requestId > after.requestId) invalid();
  }
  const savedMemory = memory(record(data.session).memory);
  if (savedMemory.goal !== session.goal) invalid();
  return { schemaVersion: 1, session: { ...session, memory: savedMemory }, turns, nextCursor: cursor(data.nextCursor) };
}

export function techniqueSessionPath(session: Pick<TechniqueSessionSummary, "sessionId" | "playerId">, preview = false): string {
  const query = new URLSearchParams({ playerId: session.playerId });
  if (preview) query.set("preview", "1");
  return `/admin/ball-striking-sessions/${encodeURIComponent(session.sessionId)}?${query}`;
}
export const techniqueTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export const techniqueDuration = (value: number) => `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} s`;
