import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeTechniqueSessionDetail, normalizeTechniqueSessionPage, techniqueSessionPath } from "./ballStriking";
import { TECHNIQUE_PREVIEW_DETAIL, TECHNIQUE_PREVIEW_LIST } from "./ballStrikingPreview";
const identity = { playerId: TECHNIQUE_PREVIEW_DETAIL.session.playerId, sessionId: TECHNIQUE_PREVIEW_DETAIL.session.sessionId };
const detail = () => structuredClone(TECHNIQUE_PREVIEW_DETAIL);

describe("ball striking audit projection boundary", () => {
  it("keeps only explicit public fields, dropping raw prompt/provider/thinking maps at every level", () => {
    const source = { ...detail(), providerResponse: "private provider", session: { ...detail().session, rawContext: "private memory" },
      turns: detail().turns.map(turn => ({ ...turn, thinking: "private thinking", systemPrompt: "private prompt", tools: turn.tools.map(tool => ({ ...tool, arguments: { pose: [1, 2, 3] } })) })) };
    const actual = normalizeTechniqueSessionDetail(source, identity);
    expect(actual).toEqual(TECHNIQUE_PREVIEW_DETAIL);
    expect(actual.turns[0]).not.toHaveProperty("thinking");
    expect(actual.turns[0].tools[0]).not.toHaveProperty("arguments");
    expect(actual.session).not.toHaveProperty("rawContext");
  });
  it("retains uncertain turns, missing measurements and empty advice without inventing output", () => {
    const source = detail(); source.turns[0].tools[0].evidence[0].athlete = null;
    const value = normalizeTechniqueSessionDetail(source, identity);
    expect(value.turns[0].tools[0].evidence[0].athlete).toBeNull();
    expect(value.turns[2]).toMatchObject({ status: "uncertain", spokenOutput: "", decisionSummary: "" });
  });
  it("keeps exact prior context snapshots while discarding extra fields and accepting older traces", () => {
    const source = detail(), prior = source.session.memory.recentReps[0];
    const withContext = { ...source, turns: source.turns.map(turn => ({ ...turn, input: { ...turn.input,
      recentReps: [{ ...prior, hiddenPrompt: "private rep context" }],
      recentChat: [{ user: "What did you mean?", assistant: "Keep the same focus for the next rep.", thinking: "private thought" }],
    } })) };
    const result = normalizeTechniqueSessionDetail(withContext, identity);
    expect(result.turns[0].input.recentReps).toEqual([prior]);
    expect(result.turns[0].input.recentChat).toEqual([{ user: "What did you mean?", assistant: "Keep the same focus for the next rep." }]);
    expect(result.turns[0].input.recentReps?.[0]).not.toHaveProperty("hiddenPrompt");
    expect(result.turns[0].input.recentChat?.[0]).not.toHaveProperty("thinking");
    for (const turn of source.turns) { delete turn.input.recentReps; delete turn.input.recentChat; }
    const older = normalizeTechniqueSessionDetail(source, identity);
    expect(older.turns[0].input).not.toHaveProperty("recentReps");
    expect(older.turns[0].input).not.toHaveProperty("recentChat");
  });
  it("rejects malformed or oversized optional prior snapshots instead of silently truncating", () => {
    const source = detail(), prior = source.session.memory.recentReps[0];
    for (const invalid of [
      { recentReps: null }, { recentChat: null }, { recentReps: Array(7).fill(prior) },
      { recentReps: [{ ...prior, cue: "x".repeat(241) }] }, { recentReps: [{ ...prior, evidenceIds: Array(13).fill("evidence") }] },
      { recentChat: Array(7).fill({ user: "Question", assistant: "Reply" }) },
      { recentChat: [{ user: "x".repeat(1001), assistant: "Reply" }] },
      { recentChat: [{ user: "Question", assistant: "x".repeat(1201) }] },
      { recentChat: [{ user: "Question", assistant: { secret: "not text" } }] },
    ]) {
      const malformed = { ...source, turns: [{ ...source.turns[0], input: { ...source.turns[0].input, ...invalid } }] };
      expect(() => normalizeTechniqueSessionDetail(malformed, identity)).toThrow();
    }
  });
  it("accepts closed-before-start tombstones and optional display names without inventing identity/reference", () => {
    const source = detail(); source.session.status = "ended"; source.session.reference = null; source.session.playerDisplayName = null;
    source.session.goal = ""; source.session.repCount = 0; source.session.memory.goal = ""; source.session.memory.focuses = []; source.session.memory.recentReps = [];
    source.turns = [{ ...source.turns[0], kind: "end", repId: null, ordinal: null, input: { ...source.turns[0].input, goal: "", referenceTitle: "" }, tools: [] }];
    expect(normalizeTechniqueSessionDetail(source, identity).session).toMatchObject({ reference: null, playerDisplayName: null, status: "ended", repCount: 0 });
  });
  it("rejects another player's/session's response rather than showing its records", () => {
    expect(() => normalizeTechniqueSessionDetail(detail(), { ...identity, playerId: "other-player" })).toThrow();
    expect(() => normalizeTechniqueSessionDetail(detail(), { ...identity, sessionId: "66666666-6666-4666-8666-666666666666" })).toThrow();
  });
  it("rejects partial/malformed, oversized or nonfinite payloads instead of rendering debug fallback", () => {
    const malformed: unknown[] = [null, { ...detail(), schemaVersion: 2 }, { ...detail(), turns: {} }];
    const wrongText = detail(); (wrongText.turns[0] as unknown as Record<string, unknown>).spokenOutput = { secret: "value" }; malformed.push(wrongText);
    const bigMemory = detail(); bigMemory.session.memory.focuses = Array(3).fill(bigMemory.session.memory.focuses[0]); malformed.push(bigMemory);
    const bigTools = detail(); bigTools.turns[0].tools = Array(9).fill(bigTools.turns[0].tools[0]); malformed.push(bigTools);
    const bigEvidence = detail(); bigEvidence.turns[0].tools[0].evidence = Array(21).fill(bigEvidence.turns[0].tools[0].evidence[0]); malformed.push(bigEvidence);
    const infinity = detail(); infinity.turns[0].tools[0].evidence[0].athlete = Infinity; malformed.push(infinity);
    const missing = detail(); delete (missing.turns[0] as Partial<typeof missing.turns[0]>).error; malformed.push(missing);
    const date = detail(); date.turns[0].createdAt = "not a timestamp"; malformed.push(date);
    const wrongModel = detail(); (wrongModel.turns[0].model as { id: string }).id = "other-model"; malformed.push(wrongModel);
    for (const value of malformed) expect(() => normalizeTechniqueSessionDetail(value, identity)).toThrow();
  });
  it("checks chronological order and duplicate turn/session identities", () => {
    const reversed = detail(); reversed.turns.reverse();
    expect(() => normalizeTechniqueSessionDetail(reversed, identity)).toThrow();
    const duplicate = detail(); duplicate.turns[1].requestId = duplicate.turns[0].requestId;
    expect(() => normalizeTechniqueSessionDetail(duplicate, identity)).toThrow();
    expect(() => normalizeTechniqueSessionPage({ ...TECHNIQUE_PREVIEW_LIST, sessions: Array(2).fill(TECHNIQUE_PREVIEW_LIST.sessions[0]) })).toThrow();
  });
  it("preserves UTC offset and microsecond chronology when UUID order differs", () => {
    const source = detail();
    source.turns[0].createdAt = "2026-10-17T19:01:00.000001+00:00";
    source.turns[1].createdAt = "2026-10-17T19:01:00.000002Z";
    source.turns[0].requestId = "99999999-9999-4999-8999-999999999999";
    expect(normalizeTechniqueSessionDetail(source, identity).turns[0].createdAt).toBe(source.turns[0].createdAt);
    source.turns[0].createdAt = "2026-02-30T19:01:00Z";
    expect(() => normalizeTechniqueSessionDetail(source, identity)).toThrow();
  });
  it("keeps opaque cursors untouched and encodes resolved player IDs in local session links", () => {
    const cursor = "opaque+/=signed-token";
    expect(normalizeTechniqueSessionPage({ ...TECHNIQUE_PREVIEW_LIST, nextCursor: cursor }).nextCursor).toBe(cursor);
    expect(new URL(techniqueSessionPath({ ...identity, playerId: "player with spaces" }, true), "https://posetek.net").searchParams.get("playerId")).toBe("player with spaces");
    expect(() => normalizeTechniqueSessionPage({ ...TECHNIQUE_PREVIEW_LIST, sessions: Array(51).fill(TECHNIQUE_PREVIEW_LIST.sessions[0]) })).toThrow();
  });
});

describe("actual Backend synthetic handler responses (2026-10-17)", () => {
  it("preserves the exact prior-rep/chat input snapshots from the updated handler", () => {
    const source = JSON.parse(readFileSync(new URL("./__fixtures__/ball-striking-v1/admin-detail-context.json", import.meta.url), "utf8"));
    const result = normalizeTechniqueSessionDetail(source, source.session);
    expect(result.turns.some(turn => turn.input.recentReps?.length)).toBe(true);
    expect(result.turns.some(turn => turn.input.recentChat?.length)).toBe(true);
    for (let index = 0; index < result.turns.length; index++) {
      expect(result.turns[index].input.recentReps).toEqual(source.turns[index].input.recentReps);
      expect(result.turns[index].input.recentChat).toEqual(source.turns[index].input.recentChat);
    }
  });
  for (const state of ["active", "ended"]) {
    it(`reads the ${state} list and chronological detail from the real handler`, () => {
      const list = JSON.parse(readFileSync(new URL(`./__fixtures__/ball-striking-v1/admin-list-${state}.json`, import.meta.url), "utf8"));
      const detail = JSON.parse(readFileSync(new URL(`./__fixtures__/ball-striking-v1/admin-detail-${state}.json`, import.meta.url), "utf8"));
      expect(normalizeTechniqueSessionPage(list).sessions).toHaveLength(list.sessions.length);
      const result = normalizeTechniqueSessionDetail(detail, detail.session);
      expect(result.turns).toHaveLength(detail.turns.length);
      expect(result.session.status).toBe(state);
    });
  }
});
