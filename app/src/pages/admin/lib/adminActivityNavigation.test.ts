import { describe, expect, it } from "vitest";
import { adminDirectoryPath, adminPlayerPath, adminPlayerReturn, parseAdminDirectoryState, selectDirectoryScope, withWorkspaceReport, workspaceReportRequest } from "./adminNavigation";
import { expandedQuery, expandedRequest } from "../../insights/lib/expandedQuery";
import { reportPayload } from "../../insights/lib/expanded";
import { workspaceMetricsPayload } from "./workspaceMetricsData";

const query = "orgId=northfield&teamId=harbor&directoryPane=report&reportView=usage&reportStart=2026-09-01&reportEnd=2026-10-01&reportTimezone=America/Los_Angeles&reportAdminFollowUp=noActivity&reportAdminSort=lastActivity&reportCursor=opaque-page&reportPage=2&reportSearch=Alex";
describe("admin activity navigation and opt-in", () => {
  it("restores selected scope, follow-up, sort, search and page after a record visit", () => {
    const state = parseAdminDirectoryState(query), list = adminDirectoryPath(state);
    const record = adminPlayerPath("athlete-a", "workouts", state);
    expect(adminPlayerReturn(record.split("?")[1])).toBe(list);
    expect(parseAdminDirectoryState(list.split("?")[1])).toMatchObject({ orgId: "northfield", teamId: "harbor", reportAdminFollowUp: "noActivity", reportAdminSort: "lastActivity", reportCursor: "opaque-page", reportPage: 2, reportSearch: "Alex" });
  });
  it("clears cohort selections on a new scope while preserving reporting dates", () => {
    const next = selectDirectoryScope(parseAdminDirectoryState(query), { orgId: "east", teamId: "junior" });
    expect(next).toMatchObject({ orgId: "east", teamId: "junior", reportStart: "2026-09-01", reportEnd: "2026-10-01", reportTimezone: "America/Los_Angeles", reportView: "usage" });
    expect(next.reportAdminFollowUp).toBeUndefined(); expect(next.reportAdminSort).toBeUndefined();
    expect(next.reportCursor).toBeUndefined(); expect(next.reportSearch).toBeUndefined();
  });
  it("rejects unsupported URL selections instead of forwarding them to the service", () => {
    const parsed = parseAdminDirectoryState("reportAdminFollowUp=everyone&reportAdminSort=privateEmail");
    expect(parsed.reportAdminFollowUp).toBeUndefined(); expect(parsed.reportAdminSort).toBeUndefined();
  });
  it("roundtrips a deliberate follow-up without changing the canonical scope", () => {
    const state = withWorkspaceReport(parseAdminDirectoryState(query), { adminFollowUp: "unfinishedAssigned", adminSort: "unfinishedAssigned", view: "workouts", cursor: "", page: 0 });
    const report = workspaceReportRequest(state);
    expect(report).toMatchObject({ orgId: "northfield", teamId: "harbor", view: "workouts", adminFollowUp: "unfinishedAssigned", adminSort: "unfinishedAssigned" });
    expect(expandedRequest(expandedQuery(report).toString())).toMatchObject({ adminFollowUp: "unfinishedAssigned", adminSort: "unfinishedAssigned" });
  });
  it("never enables new reads on ordinary coach/manager or directory payloads", () => {
    const search = "view=usage&adminFollowUp=noSignIn&adminSort=lastActivity", scope = { kind: "organization" as const, organizationId: "northfield" };
    expect(reportPayload(expandedRequest(search), scope)).not.toHaveProperty("adminReporting");
    expect(workspaceMetricsPayload(search, scope)).not.toHaveProperty("adminReporting");
    expect(workspaceMetricsPayload(search, scope, undefined, new Date("2026-11-03T20:00:00Z"), true).adminReporting).toEqual({ version: 1, followUp: "noSignIn", sort: "lastActivity" });
  });
  it.each([["usage", "lastActivity"], ["workouts", "lastWorkout"], ["overview", "name"]])("uses the %s default across the complete server page", (view, sort) => {
    expect(workspaceMetricsPayload(`view=${view}`, { kind: "global" }, undefined, new Date("2026-11-03T20:00:00Z"), true).adminReporting).toEqual({ version: 1, followUp: "all", sort });
  });
});
