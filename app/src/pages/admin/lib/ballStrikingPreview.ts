import type { TechniqueAuditTurn, TechniqueSessionDetail, TechniqueSessionPage } from "./ballStriking";

const session = {
  sessionId: "11111111-1111-4111-8111-111111111111", playerId: "sample-player", playerDisplayName: "Alex Rivera", actorUid: "sample-admin", status: "active" as const,
  goal: "Keep the shot low while striking cleanly.", reference: { referenceId: "22222222-2222-4222-8222-222222222222", versionId: "22222222-2222-4222-8222-222222222222", title: "Instep drive" },
  revision: 3, repCount: 2, createdAt: "2026-10-17T19:00:00Z", updatedAt: "2026-10-17T19:04:15Z", endedAt: null,
};
const focus = { id: "plant-position", label: "Plant foot beside the ball", evidenceIds: ["plant-foot-contact"], sourceRepIds: ["sample-rep-1"] };
const base: TechniqueAuditTurn = {
  requestId: "33333333-3333-4333-8333-333333333333", kind: "rep", ordinal: 1, repId: "sample-rep-1", createdAt: "2026-10-17T19:01:00Z", status: "complete",
  input: { goal: session.goal, referenceTitle: "Instep drive", memoryRevision: 0, focuses: [], message: null },
  tools: [{ name: "inspect_technique_evidence", section: "Plant foot", phase: "Ball contact", availableCount: 4, returnedCount: 2,
    evidence: [{ id: "plant-foot-contact", label: "Plant foot distance from ball", athlete: 0.22, reference: 0.16, units: "m", qualityNotes: ["Two-dimensional camera view; depth is unavailable."] }] }],
  decisionSummary: "The visible plant foot is farther from the ball than in the selected reference. A closer plant is a useful first cue for this goal.",
  spokenOutput: "On the next rep, try planting your foot beside the ball.", qualityNotes: [],
  model: { id: "claude-opus-5-5", provider: "anthropic_direct", effort: "medium" }, latencyMs: 2140, error: null,
};
export const TECHNIQUE_PREVIEW_LIST: TechniqueSessionPage = { schemaVersion: 1, sessions: [session, {
  ...session, sessionId: "66666666-6666-4666-8666-666666666666", status: "ended", repCount: 3, revision: 5,
  goal: "General technique coaching", createdAt: "2026-10-16T18:00:00Z", updatedAt: "2026-10-16T18:12:00Z", endedAt: "2026-10-16T18:12:00Z",
}], nextCursor: null };
export const TECHNIQUE_PREVIEW_DETAIL: TechniqueSessionDetail = {
  schemaVersion: 1, session: { ...session, memory: { schemaVersion: 1, goal: session.goal, focuses: [focus], trendSummary: "",
    recentReps: [{ repId: "sample-rep-1", ordinal: 1, cue: base.spokenOutput, evidenceIds: ["plant-foot-contact"], resultSummary: "Usable contact view; first coaching cue generated.", qualityNotes: [] }] } },
  turns: [base, { ...base, requestId: "44444444-4444-4444-8444-444444444444", kind: "chat", ordinal: null, repId: null,
    createdAt: "2026-10-17T19:02:00Z", input: { ...base.input, memoryRevision: 1, focuses: [focus], message: "How close should I plant my foot?" }, tools: [],
    decisionSummary: "Clarified the previous cue using the selected reference; no additional measurement was made.",
    spokenOutput: "Use the reference as a guide: aim beside the ball, with enough space for your kicking foot to swing through.", latencyMs: 1680,
  }, { ...base, requestId: "55555555-5555-4555-8555-555555555555", ordinal: 2, repId: "sample-rep-2", createdAt: "2026-10-17T19:04:15Z",
    status: "uncertain", input: { ...base.input, memoryRevision: 2, focuses: [focus] }, tools: [], decisionSummary: "", spokenOutput: "",
    qualityNotes: ["No new coaching advice was added to session memory."], latencyMs: 30000,
    error: { code: "provider_error", message: "The coaching reply was interrupted. Its completion could not be confirmed." },
  }], nextCursor: null,
};
