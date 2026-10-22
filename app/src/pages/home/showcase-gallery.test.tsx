import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./HomePage";
import CoachesPage from "../coaches/CoachesPage";
import { DemoPanelContent, useDemoDisclosure } from "./DemoDisclosure";

describe("public showcase initial document", () => {
  it("opts only the Players page into the fluid chapter policy", () => {
    expect(renderToStaticMarkup(<HomePage />)).toContain('data-showcase-motion-policy="fluid"');
    expect(renderToStaticMarkup(<CoachesPage />)).not.toContain('data-showcase-motion-policy="fluid"');
  });
  it.each([
    ["players", HomePage, ["tests", "profile", "training", "ai-coach", "technique", "mobile-app"]],
    ["coaches", CoachesPage, ["club", "players", "development", "contact"]],
  ] as const)("retains the %s story, ordinary links and artwork before JavaScript", (_audience, Page, chapters) => {
    const html = renderToStaticMarkup(<Page />);
    const offsets = chapters.map(id => html.indexOf(`data-showcase-chapter="${id}"`));
    expect(offsets.every(offset => offset > 0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect((html.match(/data-showcase-image=""/g) || []).length).toBe(chapters.length);
    expect(html).toContain("Enable JavaScript to explore");
    expect(html).not.toContain('data-demo="movement"');
    expect(html).not.toContain('data-demo="workout"');
    expect(html).toContain('href="/signin"');
  });

  it("keeps each legacy alias unique before any full demo has mounted", () => {
    const html = renderToStaticMarkup(<HomePage />);
    for (const id of ["how-it-works", "retest"]) expect(html.split(`id="${id}"`).length - 1).toBe(1);
    expect(html).toContain('data-showcase-demo-alias="tests"');
    expect(html).toMatch(/id="demo-panel-tests"[^>]*hidden=""[^>]*inert=""/);
  });

  it("exposes complete demo presentation only for the active retained panel", () => {
    function State() { const { expanded, managed } = useDemoDisclosure(); return <span>{`${managed}:${expanded}`}</span>; }
    expect(renderToStaticMarkup(<DemoPanelContent kind="workout" expanded><State /></DemoPanelContent>)).toContain("true:true");
    expect(renderToStaticMarkup(<DemoPanelContent kind="workout" expanded={false}><State /></DemoPanelContent>)).toContain("true:false");
  });
});
