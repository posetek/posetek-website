import { afterEach, describe, expect, it, vi } from "vitest";
import { expandedRequest } from "../../insights/lib/expandedQuery";
import { previewInsights } from "../../insights/lib/preview";
import type { ExpandedInsights, InsightScope } from "../../insights/lib/expanded";
import { assertWorkspaceMetrics, createWorkspaceMetricsTransport, workspaceMetricsPayload, workspacePayloadKey, workspaceSummaryKey, WORKSPACE_REPORT_MAX_BYTES } from "./workspaceMetricsData";

const now = new Date("2026-10-06T20:00:00Z");
const scope: InsightScope = { kind: "organization", organizationId: "northfield" };
const search = "orgId=northfield&start=2026-09-01&end=2026-10-01&timezone=America/Los_Angeles&testingWindow=cumulative";
const payload = (ids?: string[]) => workspaceMetricsPayload(search, scope, ids, now);
function report(input = payload()): ExpandedInsights {
  const data = previewInsights(expandedRequest(search, now));
  data.scope = { ...input.scope, label: "Fixture scope", access: "admin", assignedTeamsOnly: false };
  data.filters = input.filters;
  data.nameSearch = input.nameSearch || "";
  if (input.rosterPlayerIds) data.rosterMetrics = input.rosterPlayerIds.map(playerId => ({ playerId, status: "included", player: { ...data.players[0], id: playerId, organizationId: "northfield", teamId: "harbor" } }));
  return data;
}
afterEach(() => vi.useRealTimers());
describe("shared workspace reporting", () => {
  it('retries a successful but unsynchronized projection within the same five-attempt boundary', async () => {
    vi.useFakeTimers();
    const input = payload(['a']), stale = report(input), fresh = report(input);
    fresh.generatedAtMillis = stale.generatedAtMillis + 1;
    const read = vi.fn().mockResolvedValueOnce(stale).mockResolvedValue(fresh);
    const validate = vi.fn((data: ExpandedInsights) => { if (data === stale) throw Object.assign(new Error('Still synchronizing'), { code: 'unavailable' }); });
    const pending = createWorkspaceMetricsTransport(read).load('admin', input, () => true, undefined, validate);
    await vi.runAllTimersAsync();
    expect(await pending).toBe(fresh); expect(read).toHaveBeenCalledTimes(2); expect(validate).toHaveBeenCalledTimes(2);
  });
  it("requests20 rows and only visible IDs, with no private labels or client identity", () => {
    const actual = payload(["z", "a"]);
    expect(actual).toMatchObject({ pageSize: 20, scope, rosterPlayerIds: ["a", "z"], startDate: "2026-09-01", endDate: "2026-10-01" });
    expect(actual).not.toHaveProperty("uid");
  });
  it("has no lookup for summary-only or empty roster", () => {
    expect(payload()).not.toHaveProperty("rosterPlayerIds");
    expect(payload([])).not.toHaveProperty("rosterPlayerIds");
  });
  it.each([["a", "a"], Array.from({ length: 21 }, (_, i) => `p${i}`), ["bad/id"], [""]].map(ids => ({ ids })))("rejects invalid or unbounded visible lookup $ids", ({ ids }) => {
    expect(() => payload(ids)).toThrow(/visible players changed/);
  });
  it("reuses the same selection across display views and ignores directory query fields", () => {
    expect(workspacePayloadKey(payload())).toBe(workspacePayloadKey(workspaceMetricsPayload(search + "&view=testing&search=email@example.test&page=3", scope, undefined, now)));
  });
  it("validates organization rows without requiring the organization to be a team scope", () => {
    const input = payload(["a"]);
    expect(() => assertWorkspaceMetrics(report(input), input)).not.toThrow();
  });
  it("rejects a stale player organization or team without retaining metrics", () => {
    const input = payload(["a"]), data = report(input);
    if (data.rosterMetrics?.[0].status === "included") data.rosterMetrics[0].player.organizationId = "other";
    expect(() => assertWorkspaceMetrics(data, input)).toThrow(/organization or team changed/);
    const teamInput = { ...input, scope: { kind: "team", organizationId: "northfield", teamId: "another" } as InsightScope };
    expect(() => assertWorkspaceMetrics(report(teamInput), teamInput)).toThrow(/organization or team changed/);
  });
  it("accepts explicit reporting exclusion but rejects history attached to it", () => {
    const input = payload(["a"]), data = report(input);
    data.rosterMetrics = [{ playerId: "a", status: "excluded" }];
    expect(() => assertWorkspaceMetrics(data, input)).not.toThrow();
    (data.rosterMetrics[0] as unknown as Record<string, unknown>).player = data.players[0];
    expect(() => assertWorkspaceMetrics(data, input)).toThrow(/Excluded reporting evidence/);
  });
  it("rejects absent, duplicate or unexpected lookup rows", () => {
    const input = payload(["a", "b"]), data = report(input);
    delete data.rosterMetrics;
    expect(() => assertWorkspaceMetrics(data, input)).toThrow(/not returned metrics/);
    data.rosterMetrics = [{ playerId: "a", status: "excluded" }, { playerId: "a", status: "excluded" }];
    expect(() => assertWorkspaceMetrics(data, input)).toThrow(/not returned metrics/);
    data.rosterMetrics[1].playerId = "unexpected";
    expect(() => assertWorkspaceMetrics(data, input)).toThrow(/no longer match/);
  });
  it("shares concurrent identical reads without caching settled private data", async () => {
    const input = payload(["a"]);
    let settle!: (data: ExpandedInsights) => void;
    const read = vi.fn(() => new Promise<ExpandedInsights>(resolve => { settle = resolve; }));
    const transport = createWorkspaceMetricsTransport(read);
    const first = transport.load("admin", input, () => true), second = transport.load("admin", input, () => true);
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    settle(report(input));
    expect(await first).toEqual(await second);
    read.mockResolvedValueOnce(report(input));
    await transport.load("admin", input, () => true);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("drops late account and scope results", async () => {
    const input = payload(["a"]);
    let settle!: (data: ExpandedInsights) => void, current = true;
    const transport = createWorkspaceMetricsTransport(() => new Promise(resolve => { settle = resolve; }));
    const pending = transport.load("first", input, () => current);
    await Promise.resolve();
    current = false;
    transport.observeIdentity("second");
    settle(report(input));
    expect(await pending).toBeNull();
  });
  it("does not start a request for an inactive selection", async () => {
    const read = vi.fn(), transport = createWorkspaceMetricsTransport(read);
    expect(await transport.load("admin", payload(), () => false)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it("bounds cold-projection rebuild retries and retains no partial totals", async () => {
    vi.useFakeTimers();
    const expected = report();
    const read = vi.fn().mockRejectedValueOnce({ code: "failed-precondition", details: { reason: "insights-rebuild-required" } }).mockResolvedValue(expected);
    const onRebuild = vi.fn();
    const pending = createWorkspaceMetricsTransport(read).load("admin", payload(), () => true, onRebuild);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(expected);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });
  it("rejects downgraded admin access even if manager reports remain available", async () => {
    const data = report(); data.scope.access = "manager";
    await expect(createWorkspaceMetricsTransport(async () => data).load("admin", payload(), () => true)).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe('opt-in short-lived admin workspace observations', () => {
  const retained = { retain: true };
  it('reuses completed exact requests without changing original observation/check times', async () => {
    let clock = 1000;
    const expected = report(), read = vi.fn().mockResolvedValue(expected);
    const transport = createWorkspaceMetricsTransport(read, () => clock);
    await transport.load('admin', payload(), () => true, undefined, undefined, retained);
    clock += 299_999;
    expect(await transport.load('admin', payload(), () => true, undefined, undefined, retained)).toBe(expected);
    expect(transport.peek('admin', payload())?.checkedAt).toBe(1000);
    expect(transport.peek('admin', payload())?.data.generatedAtMillis).toBe(expected.generatedAtMillis);
    expect(read).toHaveBeenCalledTimes(1);
    clock++;
    expect(transport.peek('admin', payload())).toBeNull();
    await transport.load('admin', payload(), () => true, undefined, undefined, retained);
    expect(read).toHaveBeenCalledTimes(2);
    expect(transport.peek('admin', payload())?.checkedAt).toBe(clock);
  });
  it('keeps exact period, scope, filters, page, visible IDs, admin sort and Usage detail separate', () => {
    const base = workspaceMetricsPayload(search + '&view=overview', scope, undefined, now, true);
    const keys = [base,
      workspaceMetricsPayload(search + '&view=workouts', scope, undefined, now, true),
      workspaceMetricsPayload(search + '&view=testing', scope, undefined, now, true, false, true),
      workspaceMetricsPayload(search + '&view=usage', scope, undefined, now, true, true),
      { ...base, cursor: 'next' }, { ...base, startDate: '2026-08-01' },
      { ...base, rosterPlayerIds: ['one'] }, { ...base, nameSearch: 'someone' },
      { ...base, filters: { ...base.filters, workoutStatus: 'completed' } },
    ].map(workspacePayloadKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('reuses an exact report for five minutes and not after', async () => {
    let at = 1_000;
    const read = vi.fn(async (input) => report(input)), transport = createWorkspaceMetricsTransport(read, () => at);
    await transport.load('admin', payload(), () => true, undefined, undefined, retained);
    at = 1_000 + 299_999;
    expect(transport.peek('admin', payload())).not.toBeNull();
    at = 1_000 + 300_000;
    expect(transport.peek('admin', payload())).toBeNull();
  });
  it('refreshes all same-scope tab variants when one report is explicitly refreshed', async () => {
    const read = vi.fn(async (input) => report(input));
    const transport = createWorkspaceMetricsTransport(read);
    const overview = payload(), workouts = { ...payload(), nameSearch: 'workout selection' };
    await transport.load('admin', overview, () => true, undefined, undefined, retained);
    await transport.load('admin', workouts, () => true, undefined, undefined, retained);
    expect(read).toHaveBeenCalledTimes(2);
    const generation = transport.getGeneration();
    await transport.load('admin', overview, () => true, undefined, undefined, { retain: true, force: true });
    expect(read).toHaveBeenCalledTimes(3);
    expect(transport.getGeneration()).toBe(generation);
    expect(transport.peek('admin', workouts)).toBeNull();
    await transport.load('admin', workouts, () => true, undefined, undefined, retained);
    expect(read).toHaveBeenCalledTimes(4);
  });
  it('force refresh bypasses a fresh result and removes it even on transient failure', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(report());
    const transport = createWorkspaceMetricsTransport(read);
    await transport.load('admin', payload(), () => true, undefined, undefined, retained);
    read.mockRejectedValue({ code: 'unavailable' });
    const pending = transport.load('admin', payload(), () => true, undefined, undefined, { retain: true, force: true }).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ code: 'unavailable' });
    expect(read).toHaveBeenCalledTimes(6);
    expect(transport.peek('admin', payload())).toBeNull();
  });
  it('drops scoped observations and late responses after invalidation, even for the same actor', async () => {
    let finish!: (data: ExpandedInsights) => void;
    const read = vi.fn().mockResolvedValueOnce(report()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const transport = createWorkspaceMetricsTransport(read);
    await transport.load('admin', payload(), () => true, undefined, undefined, retained);
    const pending = transport.load('admin', payload(), () => true, undefined, undefined, { retain: true, force: true });
    await Promise.resolve(); transport.clear(); finish(report());
    expect(await pending).toBeNull();
    expect(transport.peek('admin', payload())).toBeNull();
    transport.observeIdentity(null); transport.observeIdentity('admin');
    expect(transport.peek('admin', payload())).toBeNull();
  });
  it('clears earlier scope entries when navigating scope and never serves another actor', async () => {
    const read = vi.fn().mockResolvedValue(report()), transport = createWorkspaceMetricsTransport(read);
    await transport.load('admin', payload(), () => true, undefined, undefined, retained);
    expect(transport.peek('other-admin', payload())).toBeNull();
    transport.observeScope({ kind: 'organization', organizationId: 'another' });
    transport.observeScope(scope);
    expect(transport.peek('admin', payload())).toBeNull();
  });
  it.each(['permission-denied', 'failed-precondition'])('invalidates other retained variants on %s without stale fallback', async code => {
    const read = vi.fn().mockResolvedValueOnce(report()).mockRejectedValueOnce({ code });
    const transport = createWorkspaceMetricsTransport(read);
    await transport.load('admin', payload(), () => true, undefined, undefined, retained);
    const other = { ...payload(), nameSearch: 'new selection' };
    await expect(transport.load('admin', other, () => true, undefined, undefined, retained)).rejects.toMatchObject({ code });
    expect(read).toHaveBeenCalledTimes(2);
    expect(transport.peek('admin', payload())).toBeNull();
  });
  it('enforces the aggregate byte budget across otherwise cacheable results', async () => {
    const read = vi.fn(async (input) => {
      const data = report(input); data.scope.label = 'x'.repeat(700_000); return data;
    });
    const transport = createWorkspaceMetricsTransport(read);
    const inputs = Array.from({ length: 3 }, (_, index) => ({ ...payload(), nameSearch: `large ${index}` }));
    for (const input of inputs) await transport.load('admin', input, () => true, undefined, undefined, retained);
    expect(transport.peek('admin', inputs[0])).toBeNull();
    expect(transport.peek('admin', inputs[2])).not.toBeNull();
  });
  it('returns valid reports even when they cannot be serialized for cache accounting', async () => {
    const expected = report();
    Object.assign(expected, { cacheIrrelevantCircularValue: expected });
    const transport = createWorkspaceMetricsTransport(async () => expected);
    expect(await transport.load('admin', payload(), () => true, undefined, undefined, retained)).toBe(expected);
    expect(transport.peek('admin', payload())).toBeNull();
  });
  it('bounds retained selections and skips oversized data', async () => {
    const read = vi.fn(async (input) => report(input)), transport = createWorkspaceMetricsTransport(read);
    const inputs = Array.from({ length: 6 }, (_, index) => ({ ...payload(), nameSearch: `selection ${index}` }));
    for (const input of inputs) await transport.load('admin', input, () => true, undefined, undefined, retained);
    expect(transport.peek('admin', inputs[0])).toBeNull();
    expect(transport.peek('admin', inputs[5])).not.toBeNull();
    const huge = report(); huge.scope.label = 'x'.repeat(2 * 1024 * 1024);
    read.mockResolvedValueOnce(huge);
    await transport.load('admin', payload(), () => true, undefined, undefined, retained);
    expect(transport.peek('admin', payload())).toBeNull();
  });
});

describe('station analytics request isolation', () => {
  it('requests bounded station analytics only in the explicit admin Testing view', () => {
    const testing = workspaceMetricsPayload(search + '&view=testing', scope, undefined, now, true, false, true);
    expect(testing.includeTestingAnalytics).toBe(true);
    expect(testing.adminReporting).toBeDefined();
    expect(workspaceMetricsPayload(search + '&view=overview', scope, undefined, now, true, false, true)).not.toHaveProperty('includeTestingAnalytics');
    expect(workspaceMetricsPayload(search + '&view=testing', scope, undefined, now, false, false, true)).not.toHaveProperty('includeTestingAnalytics');
    expect(workspaceMetricsPayload(search + '&view=testing', scope, undefined, now, true)).not.toHaveProperty('includeTestingAnalytics');
    expect(workspacePayloadKey(testing)).not.toBe(workspacePayloadKey(workspaceMetricsPayload(search + '&view=testing', scope, undefined, now, true)));
  });
});


describe('same-cohort display-only summaries', () => {
  const retained = { retain: true };
  const input = () => workspaceMetricsPayload(search + '&view=overview', scope, undefined, now, true);
  function summaryReport(request = input()) {
    const data = report(request);
    data.players = [];
    data.adminReporting = { version: 1, followUp: request.adminReporting!.followUp, sort: request.adminReporting!.sort, asOfMillis: now.getTime(), population: data.roster.filtered,
      summary: { noSignIn: 0, noActivity: 0, unfinishedAssigned: 0, noCompletion: 0, signInUnknown: 0, usageNotCollected: 0 }, topActivePlayers: [], topWorkoutPlayers: [], teams: [] };
    return data;
  }
  it('shares only cohort summaries while a first detail variant remains pending', async () => {
    let finish!: (data: ExpandedInsights) => void;
    const first = input(), detail = workspaceMetricsPayload(search + '&view=usage', scope, undefined, now, true, true);
    const firstData = summaryReport(first);
    const read = vi.fn().mockResolvedValueOnce(firstData).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const transport = createWorkspaceMetricsTransport(read, () => 1000);
    await transport.load('admin', first, () => true, undefined, undefined, retained);
    const pending = transport.load('admin', detail, () => true, undefined, undefined, retained);
    await Promise.resolve();
    expect(transport.peek('admin', detail)).toBeNull();
    const shared = transport.peekSummary('admin', detail)!;
    expect(shared.checkedAt).toBe(1000);
    expect(shared.data.generatedAtMillis).toBe(firstData.generatedAtMillis);
    expect(shared.data.usage).toEqual(firstData.usage);
    for (const key of ['players', 'pagination', 'rosterMetrics', 'nameSearch']) expect(shared.data).not.toHaveProperty(key);
    expect(shared.data.adminReporting).not.toHaveProperty('sort');
    expect(shared.data.adminReporting).not.toHaveProperty('followUp');
    expect(shared.data.roster).not.toHaveProperty('matched');
    finish(summaryReport(detail)); await pending;
    expect(transport.peek('admin', detail)).not.toBeNull();
  });
  it('retains the original summary timestamp beyond freshness without claiming an exact cache hit', async () => {
    let clock = 1000;
    const data = summaryReport(), transport = createWorkspaceMetricsTransport(async () => data, () => clock);
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    clock += 300_001;
    expect(transport.peek('admin', input())).toBeNull();
    expect(transport.peekSummary('admin', input())).toMatchObject({ checkedAt: 1000, stale: true, data: { generatedAtMillis: data.generatedAtMillis } });
  });
  it('omits proven presentation fields but isolates every cohort dimension and requires admin evidence', async () => {
    const base = input(), transport = createWorkspaceMetricsTransport(async () => summaryReport());
    await transport.load('admin', base, () => true, undefined, undefined, retained);
    const presentation = { ...base, nameSearch: 'Alex', cursor: 'next', pageSize: 10, rosterPlayerIds: ['x'], includeTestingAnalytics: true as const, adminReporting: { ...base.adminReporting!, followUp: 'active' as const, sort: 'lastActivity' as const } };
    expect(workspaceSummaryKey(presentation)).toBe(workspaceSummaryKey(base));
    expect(transport.peekSummary('admin', presentation)).not.toBeNull();
    for (const changed of [{ ...base, startDate: '2026-08-01' }, { ...base, endDate: '2026-09-30' }, { ...base, timeZone: 'UTC' }, { ...base, testingMode: 'period' as const }, { ...base, filters: { division: 'girls' } }, { ...base, scope: { kind: 'team' as const, organizationId: 'northfield', teamId: 'harbor' } }, { ...base, adminReporting: undefined }]) expect(transport.peekSummary('admin', changed)).toBeNull();
    expect(transport.peekSummary('another', base)).toBeNull();
  });
  it.each(['permission-denied', 'failed-precondition'])('clears summaries on %s and fences late invalidated responses', async code => {
    const read = vi.fn().mockResolvedValueOnce(summaryReport()).mockRejectedValueOnce({ code });
    const transport = createWorkspaceMetricsTransport(read);
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    await expect(transport.load('admin', input(), () => true, undefined, undefined, { retain: true, force: true })).rejects.toMatchObject({ code });
    expect(transport.peekSummary('admin', input())).toBeNull();
    read.mockResolvedValue(summaryReport());
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    transport.clear(); expect(transport.peekSummary('admin', input())).toBeNull();
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    transport.observeIdentity(null); transport.observeIdentity('admin'); expect(transport.peekSummary('admin', input())).toBeNull();
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    transport.observeScope({ kind: 'global' }); transport.observeScope(scope); expect(transport.peekSummary('admin', input())).toBeNull();
  });
  it('restores an original cohort summary from a fresh exact observation after a filter roundtrip', async () => {
    let clock = 1000;
    const transport = createWorkspaceMetricsTransport(async request => summaryReport(request), () => clock);
    const first = input(), filtered = { ...first, filters: { division: 'girls' } };
    await transport.load('admin', first, () => true, undefined, undefined, retained);
    clock += 1000;
    await transport.load('admin', filtered, () => true, undefined, undefined, retained);
    const detail = { ...first, includeLastFeatureEvidence: true as const };
    expect(transport.peek('admin', detail)).toBeNull();
    expect(transport.peekSummary('admin', detail)).toMatchObject({ checkedAt: 1000, data: { filters: {} } });
  });
  it('never repopulates a cleared summary from an already-pending response', async () => {
    let finish!: (data: ExpandedInsights) => void;
    const read = vi.fn().mockResolvedValueOnce(summaryReport()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const transport = createWorkspaceMetricsTransport(read);
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    const pending = transport.load('admin', input(), () => true, undefined, undefined, { retain: true, force: true });
    await Promise.resolve(); transport.clear(); finish(summaryReport());
    expect(await pending).toBeNull(); expect(transport.peekSummary('admin', input())).toBeNull();
  });
  it('keeps an honestly dated summary through transient failures, but discards it if admin evidence disappears', async () => {
    vi.useFakeTimers();
    const first = summaryReport(), read = vi.fn().mockResolvedValueOnce(first).mockRejectedValue({ code: 'unavailable' });
    const transport = createWorkspaceMetricsTransport(read, () => 1000);
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    const failed = transport.load('admin', input(), () => true, undefined, undefined, { retain: true, force: true }).catch(error => error);
    await vi.runAllTimersAsync(); expect(await failed).toMatchObject({ code: 'unavailable' });
    expect(transport.peek('admin', input())).toBeNull();
    expect(transport.peekSummary('admin', input())).toMatchObject({ checkedAt: 1000, data: { generatedAtMillis: first.generatedAtMillis } });
    read.mockResolvedValue(report(input()));
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    expect(transport.peekSummary('admin', input())).toBeNull();
  });
  it('rejects invalid response metadata and clears prior summaries', async () => {
    const malformed = summaryReport(); malformed.period = { ...malformed.period, endDate: '2026-09-30' };
    const read = vi.fn().mockResolvedValueOnce(summaryReport()).mockResolvedValueOnce(malformed);
    const transport = createWorkspaceMetricsTransport(read);
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    await expect(transport.load('admin', input(), () => true, undefined, undefined, { retain: true, force: true })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(transport.peekSummary('admin', input())).toBeNull();
  });
  it('counts summary and exact observations together within the existing byte budget', async () => {
    const data = summaryReport(); data.scope.label = 'x'.repeat(700_000);
    const transport = createWorkspaceMetricsTransport(async request => ({ ...data, nameSearch: request.nameSearch || '' }));
    const first = input(), second = { ...first, nameSearch: 'Alex' };
    await transport.load('admin', first, () => true, undefined, undefined, retained);
    await transport.load('admin', second, () => true, undefined, undefined, retained);
    const summary = transport.peekSummary('admin', second)!;
    const observations = [summary.data, transport.peek('admin', first)?.data, transport.peek('admin', second)?.data].filter(Boolean);
    expect(observations.reduce((bytes, value) => bytes + new TextEncoder().encode(JSON.stringify(value)).byteLength, 0)).toBeLessThanOrEqual(WORKSPACE_REPORT_MAX_BYTES);
    expect(transport.peek('admin', first)).toBeNull(); expect(transport.peek('admin', second)).not.toBeNull();
  });
  it('does not produce summaries from non-admin or legacy reports missing the extension', async () => {
    const transport = createWorkspaceMetricsTransport(async () => report(input()));
    await transport.load('admin', input(), () => true, undefined, undefined, retained);
    expect(transport.peekSummary('admin', input())).toBeNull();
  });
});

describe("lookup-only roster requests", () => {
  const lookup = (ids?: string[], lookupOnly?: boolean) => workspaceMetricsPayload(search, scope, ids, now, false, false, false, lookupOnly);
  it("sends rosterLookupOnly only when requested with visible ids", () => {
    expect(lookup(["a"], true)).toMatchObject({ rosterPlayerIds: ["a"], rosterLookupOnly: true });
    expect(lookup(["a"])).not.toHaveProperty("rosterLookupOnly");
    expect(lookup(["a"], false)).not.toHaveProperty("rosterLookupOnly");
    expect(lookup(undefined, true)).not.toHaveProperty("rosterLookupOnly");
  });
  it("keys lookup-only requests separately from full reports", () => {
    expect(workspacePayloadKey(lookup(["a"], true))).not.toBe(workspacePayloadKey(lookup(["a"])));
    expect(workspacePayloadKey(lookup(["a"], true))).toBe(workspacePayloadKey(lookup(["a"], true)));
  });
  it("validates a plain full response against a lookup-only request, so either backend works", () => {
    const input = lookup(["a"], true);
    expect(() => assertWorkspaceMetrics(report(input), input)).not.toThrow();
  });
});
