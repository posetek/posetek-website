import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
vi.mock("../../../lib/firebase", () => ({ default: {}, auth: {}, db: {} }));
vi.mock("../../../lib/organization-data", () => ({ getClubContext: vi.fn(), clubCall: vi.fn(), invalidateClubContext: vi.fn() }));
const directoryRead = vi.hoisted(() => ({ organizations: vi.fn(), rows: [] as unknown[] }));
vi.mock("../lib/useAccountLoad", async importOriginal => {
  const actual = await importOriginal<typeof import("../lib/useAccountLoad")>();
  return { ...actual, useAccountLoad: (loader: () => Promise<unknown>) => loader === directoryRead.organizations
    ? { state: { kind: "ready", data: directoryRead.rows }, refresh: vi.fn() }
    : actual.useAccountLoad(loader) };
});
import { directorySource } from "../lib/adminDirectory";
import MonitorAccounts, { DirectoryPlayersTable, DirectoryTabs, PlayerReporting } from "./MonitorAccounts";
import type { PlayerRow } from "../lib/accounts";
import type { AdminDirectoryState } from "../lib/adminNavigation";
import { DirectoryWorkspaceTabs } from "./DirectoryWorkspaceControls";
const state: AdminDirectoryState = { orgId: "club", teamId: "team", directoryTab: "players", search: "Example", page: 1 };
const player: PlayerRow = { id: "athlete", name: "Example Athlete", email: "player@example.test", coachId: null, organizationId: "club", teamId: "team", registered: true, signupCode: null, raw: { organizationId: "club", birthDate: "2011-01-01" } };

beforeEach(() => { directoryRead.rows = []; });

describe("admin directory presentation", () => {
  it.each(["/admin/accounts", "/admin/accounts?orgId=old", "/admin/accounts?orgId=old&directoryTab=staff"])("hides legacy organization choices and rejects legacy deep links: %s", url => {
    directoryRead.rows = [
      { id: "club", name: "Current club", schemaVersion: 2, coachIds: [], code: "", logoUrl: null },
      { id: "old", name: "Old roster", schemaVersion: 1, coachIds: [], code: "", logoUrl: null },
    ];
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><MonitorAccounts source={{ ...directorySource, organizations: directoryRead.organizations }} /></MemoryRouter>);
    expect(html).toContain("Current club");
    expect(html).not.toContain("Old roster");
    expect(html).not.toContain("Legacy organization");
    if (url.includes("orgId=old")) expect(html).toContain("That organization is no longer available. Choose a current organization.");
  });
  it("renders the workspace and tabs before organizations or unrelated accounts finish loading", () => {
    const html = renderToStaticMarkup(<MemoryRouter><MonitorAccounts /></MemoryRouter>);
    expect(html).toContain("People &amp; organizations"); expect(html).toContain("Loading organizations…");
    for (const label of ["Players", "Staff", "Manage teams", "Organization settings"]) expect(html).toContain(label);
    expect(html).not.toContain("Loading accounts…");
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain("Jump to people");
    expect(html).not.toContain("directory-player-table");
  });
  it("has one selected keyboard tab and associates each tab with its panel", () => {
    const html = renderToStaticMarkup(<DirectoryTabs active="staff" onChange={() => {}} />);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1); expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain('id="directory-tab-staff" role="tab" aria-selected="true" aria-controls="directory-panel-staff"');
  });
  it("opens Results from the name and retains Workouts/Profile in the row action menu without losing directory state", () => {
    const html = renderToStaticMarkup(<MemoryRouter><DirectoryPlayersTable players={[player]} state={state} choose={() => {}} /></MemoryRouter>);
    expect(html).toContain('id="admin-player-athlete"'); expect(html).toContain('aria-label="Workouts for Example Athlete"'); expect(html).toContain('aria-label="Profile for Example Athlete"');
    expect(html).toContain("playerTab=workouts"); expect(html).toContain("playerTab=profile"); expect(html).toContain("search=Example"); expect(html).toContain("page=1"); expect(html).toContain("returnTo=");
    expect(html).not.toContain("playerTab=results"); expect(html).not.toContain("/admin/organizations");
    expect(html).toContain('aria-label="Open actions for Example Athlete"');
  });
  it("leads with people and keeps the complete report in explicitly selected tabs", () => {
    const render = (directoryPane?: "list" | "report") => renderToStaticMarkup(<MemoryRouter><PlayerReporting state={{ ...state, directoryPane }} choose={() => {}} scope={{ kind: "organization", organizationId: "club" }} scopeLabel="Club" accountRows={[player]} enabled showPeople toolbar={<p>Find a player in this organization</p>} /></MemoryRouter>);
    const list = render();
    expect(list).toContain('id="admin-player-athlete"');
    expect(list).not.toContain('id="directory-report-graphs"');
    const report = render("report");
    expect(report).toContain('id="directory-report-graphs"');
    expect(report).not.toContain('id="admin-player-athlete"');
    for (const label of ["People", "Overview", "Testing", "Workouts", "Usage"]) expect(list).toContain(label);
  });
  it("keeps one keyboard entry point across list and reporting tabs", () => {
    const html = renderToStaticMarkup(<DirectoryWorkspaceTabs active="list" listLabel="Teams" onChange={() => {}} />);
    expect(html.match(/role="tab"/g)).toHaveLength(5);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain('aria-controls="workspace-report-panel-list"');
  });
  it("limits visible invitations/profile rows to the current page", () => {
    const players = Array.from({ length: 45 }, (_, index) => ({ ...player, id: `p${index}`, name: `Player ${index}` }));
    const html = renderToStaticMarkup(<MemoryRouter><DirectoryPlayersTable players={players} state={{ ...state, search: "", page: 2 }} choose={() => {}} /></MemoryRouter>);
    expect(html).toContain("Player 20"); expect(html).toContain("Player 39"); expect(html).not.toContain("Player 40"); expect(html).not.toContain("Player 19"); expect(html).toContain("Page 2 of 3");
  });
  it("retains the known unassigned identity count while an attention queue loads", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PlayerReporting state={{ ...state, teamId: undefined, directoryLookup: "unassigned", reportTeamAssignment: "unassigned", reportMode: "attention" }} choose={() => {}} scope={{ kind: "organization", organizationId: "club" }} accountCount={2} scopeLabel="Unassigned / unavailable team · Club" accountRows={[]} enabled showPeople toolbar={null} /></MemoryRouter>);
    expect(html).toContain('class="workspace-scope-count">2 loaded players');
    expect(html).toContain('aria-label="Selected organization and team"');
    expect(html).toContain("Unassigned / unavailable team · Club");
  });
});
