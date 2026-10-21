import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("../lib/repToolsData", () => ({ pushJumpTechnique: vi.fn() }));
import JumpTechniqueEditor from "./JumpTechniqueEditor";
it("shows missing evidence instead of an editable unsupported correction", () => {
  const html = renderToStaticMarkup(<JumpTechniqueEditor playerId="synthetic" repId="jump" athleteName="Sample athlete" source={{}}
    originalHeight={.2} originalAngles={{}} revisionId={null} currentFrame={0} lastFrame={100} seekTo={() => {}} onSaved={() => {}} />);
  expect(html).toContain("Saved jump phase frames are unavailable");
  expect(html).toContain('aria-label="Coil technique frame"');
  expect(html).toContain("Review technique correction");
  expect(html).toMatch(/disabled=""[^>]*>Review technique correction/);
});
