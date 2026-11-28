import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKILL,
  HEADER_SCROLL_THRESHOLD,
  SAMPLE_DRIBBLE_RESULT,
  SKILL_DATA,
  SKILL_ORDER,
  isHeaderScrolled,
  menuButtonLabel,
  progressFillBackground,
  progressFillWidth,
  skillDotShadow,
} from "./home-logic";
import { sampleAthlete } from "./product/product-demo";

describe("isHeaderScrolled", () => {
  it("adds .scrolled strictly past 12px", () => {
    expect(HEADER_SCROLL_THRESHOLD).toBe(12);
    expect(isHeaderScrolled(0)).toBe(false);
    expect(isHeaderScrolled(12)).toBe(false);
    expect(isHeaderScrolled(13)).toBe(true);
  });
});

describe("menuButtonLabel", () => {
  it("mirrors the legacy aria-label strings", () => {
    expect(menuButtonLabel(false)).toBe("Open navigation");
    expect(menuButtonLabel(true)).toBe("Close navigation");
  });
});

describe("skill map data", () => {
  it("starts the sample skill map on the ball control used in Alex’s workout", () => {
    expect(SKILL_ORDER).toEqual(["speed", "shooting", "power", "control", "agility"]);
    expect(DEFAULT_SKILL).toBe("control");
    expect(SKILL_DATA[DEFAULT_SKILL].name).toBe("Ball Control");
  });

  it("uses the same dribbling result in the profile and the retest conversation", () => {
    const dribbling = sampleAthlete.metrics.find(metric => metric.key === "dribbling");
    expect(SAMPLE_DRIBBLE_RESULT).toBe(`${dribbling?.value} s`);
    expect(SKILL_DATA.control.metrics).toContainEqual(["Shuttle time", SAMPLE_DRIBBLE_RESULT]);
  });

  it("preserves the sampled agility breakdown", () => {
    expect(SKILL_DATA.agility).toEqual({
      name: "Agility",
      score: 68,
      color: "#ffbd59",
      change: "↑ Improving",
      metrics: [["Total time", "5.12 s"], ["Start phase", "1.82 s"], ["Turn phase", "1.48 s"]],
      note: "Focus: faster braking and redirection through the turn.",
    });
  });

  it("keeps three metrics per skill", () => {
    SKILL_ORDER.forEach(key => expect(SKILL_DATA[key].metrics).toHaveLength(3));
  });
});

describe("inline style helpers", () => {
  it("appends the 0x1c alpha to the dot shadow color", () => {
    expect(skillDotShadow("#ffbd59")).toBe("0 0 0 5px #ffbd591c");
  });

  it("formats the progress fill width and gradient", () => {
    expect(progressFillWidth(68)).toBe("68%");
    expect(progressFillBackground("#4bd7e8")).toBe("linear-gradient(90deg, #4bd7e8, #b7f34a)");
  });
});
