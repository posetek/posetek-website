import { describe, expect, it } from "vitest";
import { expandedRequest } from "../../insights/lib/expandedQuery";
import { previewInsights } from "../../insights/lib/preview";
import { assertWorkspaceMetrics, createWorkspaceMetricsTransport, workspaceMetricsPayload } from "./workspaceMetricsData";
import type { ExpandedInsights } from "../../insights/lib/expanded";

const search = "start=2026-09-01&end=2026-10-01&view=usage&adminSort=lastActivity";
const input = () => workspaceMetricsPayload(search, { kind: "organization", organizationId: "northfield" }, undefined, new Date("2026-11-03T20:00:00Z"), true, true);
function fixture(): ExpandedInsights {
  const payload = input(), data = previewInsights(expandedRequest(search, new Date("2026-11-03T20:00:00Z")));
  data.scope = { ...payload.scope, label: "Northfield", access: "admin", assignedTeamsOnly: false };
  data.filters = payload.filters; data.nameSearch = "";
  data.adminReporting = { version: 1, followUp: "all", sort: "lastActivity", asOfMillis: Date.parse("2026-11-03T20:00:00Z"), population: data.roster.filtered,
    summary: { noSignIn: 1, noActivity: 1, unfinishedAssigned: 0, noCompletion: 0, signInUnknown: 1, usageNotCollected: 1 }, topActivePlayers: [], topWorkoutPlayers: [], teams: [] };
  for (const row of data.players) {
    row.organizationId = "northfield"; row.teamId = "harbor";
    row.adminReporting = { signIn: { status: "unknown", lastSignInAtMillis: null }, usage: { lastActivityWindow: null }, workouts: { latest: null }, assigned: { status: "unavailable", weekNumber: null, remaining: null, notStarted: null, noEnding: null } };
  }
  return data;
}
describe("admin activity read validation", () => {
  it("keeps old-backend absence distinct from new measured zero", () => {
    const data = fixture(); delete data.adminReporting;
    expect(() => assertWorkspaceMetrics(data, input())).not.toThrow();
    expect(data.adminReporting).toBeUndefined();
  });
  it("accepts explicit unknown evidence without converting it into inactivity", () => {
    const data = fixture(); expect(() => assertWorkspaceMetrics(data, input())).not.toThrow();
    expect(data.players[0].adminReporting?.signIn.status).toBe("unknown");
    expect(data.players[0].adminReporting?.assigned.remaining).toBeNull();
  });
  it.each(["followUp", "sort", "version", "population"])("rejects a response for a different %s", field => {
    const data = fixture(); Object.assign(data.adminReporting!, { [field]: field === "version" ? 2 : field === "population" ? -1 : "different" });
    expect(() => assertWorkspaceMetrics(data, input())).toThrow(/no longer matches/);
  });
  it("rejects false sign-in proof and an activity row from another organization", () => {
    const data = fixture(); data.players[0].adminReporting!.signIn = { status: "recorded", lastSignInAtMillis: null };
    expect(() => assertWorkspaceMetrics(data, input())).toThrow(/Player activity/);
    const other = fixture(); other.players[0].organizationId = "foreign";
    expect(() => assertWorkspaceMetrics(other, input())).toThrow(/Player activity/);
  });
  it("rejects impossible activity windows rather than displaying a precise stop", () => {
    const data = fixture(); data.players[0].adminReporting!.usage.lastActivityWindow = { startMillis: 1000, endMillis: 1000 };
    expect(() => assertWorkspaceMetrics(data, input())).toThrow(/timing/);
  });
  it("accepts a generic window from an older server and both supported feature evidence bases", () => {
    const data = fixture();
    const interval = { startMillis: 900_000, endMillis: 1_800_000 };
    const usage = data.players[0].adminReporting!.usage;
    usage.lastActivityWindow = interval;
    expect(() => assertWorkspaceMetrics(data, input())).not.toThrow();
    for (const basis of ["latestInterval", "window"] as const) {
      usage.lastActivityWindow = { ...interval, featureEvidence: { basis, features: ["training", "video"] } };
      expect(() => assertWorkspaceMetrics(data, input())).not.toThrow();
    }
  });
  it("rejects malformed feature evidence before presentation", () => {
    for (const featureEvidence of [null, "training", { basis: "screen", features: ["training"] },
      { basis: "latestInterval", features: [] }, { basis: "window", features: ["training", "training"] },
      { basis: "window", features: ["unknown_screen"] }, { basis: "window", features: "training" }]) {
      const data = fixture();
      data.players[0].adminReporting!.usage.lastActivityWindow = { startMillis: 900_000, endMillis: 1_800_000 };
      Object.assign(data.players[0].adminReporting!.usage.lastActivityWindow!, { featureEvidence });
      expect(() => assertWorkspaceMetrics(data, input())).toThrow(/feature evidence/);
    }
  });
  it("clears late activity reads when the actor changes", async () => {
    let finish!: (report: ExpandedInsights) => void;
    const transport = createWorkspaceMetricsTransport(() => new Promise(resolve => { finish = resolve; }));
    const pending = transport.load("admin-a", input(), () => true);
    await Promise.resolve(); transport.observeIdentity("admin-b"); finish(fixture());
    expect(await pending).toBeNull();
  });
});
