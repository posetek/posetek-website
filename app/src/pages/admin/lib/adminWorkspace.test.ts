import { describe, expect, it } from "vitest";
import { adminWorkspaceContext, findAdminTools } from "./adminWorkspace";

describe("admin workspace navigation", () => {
  it("finds tools from ordinary task words without pretending to search athlete records", () => {
    expect(findAdminTools("players").map(tool => tool.path)).toContain("/admin/accounts");
    expect(findAdminTools("workout drafts").map(tool => tool.path)).toEqual(["/admin/programs"]);
    expect(findAdminTools("ACCOUNT recovery").map(tool => tool.path)).toEqual(["/admin/access"]);
    expect(findAdminTools("person-who-is-not-in-the-tool-directory")).toEqual([]);
  });
  it("keeps only known admin routes in empty and punctuation searches", () => {
    expect(findAdminTools("").every(tool => tool.path.startsWith("/admin/"))).toBe(true);
    expect(findAdminTools("https://foreign.example/")).toEqual([]);
  });
  it("labels nested records without exposing IDs as names or losing their parent workspace", () => {
    expect(adminWorkspaceContext("/admin/accounts/player/private-id")).toEqual({ title: "Player record", section: "People & organizations", icon: "person" });
    expect(adminWorkspaceContext("/admin/accounts/player/private-id/results/jump/rep").title).toBe("Player evidence");
    expect(adminWorkspaceContext("/admin/device-performance/advanced/install").title).toBe("Device performance");
    expect(adminWorkspaceContext("/insights").title).toBe("Overview");
  });
});
