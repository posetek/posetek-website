import { describe, expect, it } from "vitest";
import { jumpFrames, previewJumpTechnique } from "./jumpTechnique";
function source() {
  return { "key_frames.json": [10, 220, 320, 360],
    "filtered_average_2d_positions.json": Array.from({ length: 400 }, () => [[0, 1], [0, .8], [.1, .6], [.1, .3], [.25, .4], [.4, .4]]),
    "velocity.json": Array.from({ length: 321 }, () => [0, 0]),
    "chest_offsets.json": Array.from({ length: 400 }, () => [0, -.2]) };
}
describe("jump phase correction preview", () => {
  it("derives five angles and keeps the exact height for phase-only changes", () => {
    const value = previewJumpTechnique([200, 260, 320, 360], source(), .123456789);
    expect(value.changed).toBe(true); expect(value.height).toBe(.123456789);
    expect(value.angles).toHaveLength(4); expect(value.angles[0]).toHaveLength(5);
    expect(value.angles[0][0]).toBe(90);
    expect(value.angles[0][1]).toBeCloseTo(153.434948823, 8);
  });
  it("does not accept incomplete, fractional, reversed or out-of-range frames", () => {
    for (const frames of [[200, 260, 320], [200, 260.5, 320, 360], [200, 330, 320, 360], [200, 260, 320, 400]]) {
      expect(() => previewJumpTechnique(frames, source(), .1)).toThrow();
    }
    expect(jumpFrames([null, 2, 3, 4])).toBeNull();
  });
  it("rejects missing joint evidence and chart range extensions", () => {
    const data = source(); data["filtered_average_2d_positions.json"][200] = [];
    expect(() => previewJumpTechnique([200, 260, 320, 360], data, .1)).toThrow(/joint positions/);
    expect(() => previewJumpTechnique([200, 260, 330, 360], source(), .1)).toThrow(/chart range/);
  });
  it("derives height only when the peak changes", () => {
    expect(previewJumpTechnique([200, 260, 320, 370], source(), .1).height).toBe(.2);
    const data = source(); data["chest_offsets.json"] = [];
    expect(() => previewJumpTechnique([200, 260, 320, 370], data, .1)).toThrow(/displacement/);
  });
});
