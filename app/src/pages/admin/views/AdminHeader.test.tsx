import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../../lib/organization-data", () => ({ getClubContext: vi.fn(), subscribeClubContextInvalidation: vi.fn() }));
import AdminHeader from "./AdminHeader";
import AdminWorkspace from "./AdminWorkspace";
describe("single admin workspace header", () => {
  it("has one People & organizations destination and an Overview entry to Insights", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/admin/accounts?orgId=club&reportView=usage"]}>
      <AdminHeader ready uid="fixture-admin" email="fixture@posetek.test" onSignOut={() => {}} />
    </MemoryRouter>);
    expect(html).toContain('aria-label="PoseTek people and organizations"');
    expect(html).toMatch(/href="\/insights\?from=organization&amp;view=overview"[^>]*>Overview<\/a>/);
    expect(html).toContain("People &amp; organizations"); expect(html).toContain(">Overview<");
    expect(html).toContain('href="/admin/accounts?orgId=club&amp;reportView=usage"');
    expect(html).not.toContain('Admin organization scope');
  });
  it("returns from a player to the exact workspace origin instead of a stale selected player scope", () => {
    const origin = "/admin/accounts?reportView=testing&reportStart=2026-09-01&search=Ana&page=2&reportCursor=opaque&reportMode=attention";
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/admin/accounts/player/athlete?orgId=club&returnTo=" + encodeURIComponent(origin)]}>
      <AdminHeader ready uid="fixture-admin" onSignOut={() => {}} />
    </MemoryRouter>);
    expect(html).toContain(origin.replaceAll("&", "&amp;"));
  });
  it("offers a labelled tool search and collapsed mobile navigation without introducing record search", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/admin/accounts"]}><AdminHeader ready uid="fixture-admin" onSignOut={() => {}} /></MemoryRouter>);
    expect(html).toContain('aria-label="Find an admin tool"');
    expect(html).toContain('aria-label="Open admin navigation" aria-expanded="false" aria-controls="admin-navigation"');
    expect(html).toContain('aria-label="Admin sections"');
    expect(html).not.toContain('aria-label="Search all players"');
    expect(html).not.toContain('aria-modal="true"');
  });
  it("adds Overview shortcuts around the existing report content only for the admin Insights wrapper", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/insights?view=overview"]}><AdminWorkspace ready uid="fixture-admin" insights onSignOut={() => {}}><section>Existing report evidence</section></AdminWorkspace></MemoryRouter>);
    expect(html).toContain('aria-label="Overview shortcuts"');
    expect(html).toContain("Existing report evidence");
    expect(html).toContain('id="admin-main"');
    const gated = renderToStaticMarkup(<MemoryRouter><AdminWorkspace ready={false} insights onSignOut={() => {}}>Access required</AdminWorkspace></MemoryRouter>);
    expect(gated).not.toContain('aria-label="Overview shortcuts"');
    expect(gated).not.toContain('aria-label="Admin sections"');
  });
});
