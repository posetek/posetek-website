import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoDisclosure, useDemoDisclosure } from "./DemoDisclosure";
import { DrillMedia } from "./product/DrillMedia";

function State() {
  const { expanded, managed } = useDemoDisclosure();
  return <span>{`${managed ? "managed" : "standalone"}:${expanded ? "full" : "compact"}`}</span>;
}

describe("inline marketing demo disclosure", () => {
  it("renders a compact accessible control without removing the detail subtree", () => {
    const html = renderToStaticMarkup(<DemoDisclosure kind="profile" label="Athlete profile"><State /><div data-detail="preserved">Detailed sample results</div></DemoDisclosure>);
    expect(html).toContain('data-demo-expanded="false"');
    expect(html).toContain('aria-expanded="false"');
    const region = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(region).toBeTruthy();
    expect(html).toContain(`id="${region}"`);
    expect(html).toContain("Explore full demo");
    expect(html).toContain("managed:compact");
    expect(html).toContain('data-detail="preserved"');
  });

  it("keeps existing standalone demos in their full presentation", () => {
    expect(renderToStaticMarkup(<State />)).toContain("standalone:full");
    const html = renderToStaticMarkup(<DrillMedia drillId="DRB-006" />);
    expect(html).toMatch(/class="drill-media-switch"[^>]*hidden=""/);
  });

  it("offers the existing overview/video switch in the compact presentation without dropping either pane", () => {
    const html = renderToStaticMarkup(<DemoDisclosure kind="workout" label="Workout planner"><DrillMedia drillId="DRB-006" /></DemoDisclosure>);
    expect(html).not.toMatch(/class="drill-media-switch"[^>]*hidden=""/);
    expect(html).toContain('class="drill-video-panel" hidden=""');
    expect(html).toContain("From the PoseTek drill library");
    expect(html).toContain("Overview");
    expect(html).toContain("Demo");
  });
});
