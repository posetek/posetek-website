import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MIN_GROUP } from "../athlete-portal/player/stats/club-cloud";
import { AthleteProfile } from "./AthleteProfile";
import { DEFAULT_PATHWAY_ID, pathwayTestIds, sampleDribbleTimes, samplePathways, samplePathwayStats } from "./development-pathway-sample";
import { sampleAthlete } from "./product/product-demo";

describe("public player development pathway", () => {
  it("presents the signed-in age-group chart and its accessible table with fictional data", () => {
    const html = renderToStaticMarkup(<AthleteProfile onOpenWorkout={() => {}} />);
    expect(html).toContain("Fictional example");
    expect(html).toContain('class="club-cloud-frame"');
    expect(html).toContain("You · 3.24 m/s");
    const score = html.match(/<dl class="profile-pathway-numbers"[^>]*>([\s\S]*?)<\/dl>/)?.[1];
    expect(score).toContain("Alex’s best</dt><dd>3.24 <small>m/s</small>");
    expect(score).toContain("U17 club average</dt><dd>3.28 <small>m/s</small>");
    expect(html).toContain("<caption>Left dribble · Course speed: average and standard deviation by age group</caption>");
    expect(html.match(/data-pathway-test=/g)).toHaveLength(6);
    expect(html).toContain("Try Alex’s dribbling workout");
  });

  it("uses the same times as the public retest demo, with course speed calculated from distance", () => {
    expect(sampleDribbleTimes).toEqual(sampleAthlete.metrics.find(metric => metric.key === "dribbling")?.values);
    const stats = samplePathwayStats(DEFAULT_PATHWAY_ID);
    expect(stats.own?.results).toEqual(sampleDribbleTimes.map(time => 20 / time));
    expect(stats.own?.best).toBeCloseTo(20 / parseFloat(samplePathways.dribbleLeft.testDayResult));
    expect(stats.unit).toBe("m/s");
  });

  it("supplies seven populated age groups and a separately measured individual for every test", () => {
    for (const id of pathwayTestIds) {
      const stats = samplePathwayStats(id);
      expect(stats.groups.map(group => group.ageGroup)).toEqual([11, 12, 13, 14, 15, 16, 17]);
      expect(stats.groups.every(group => group.count >= MIN_GROUP && group.mean > 0 && group.sd > 0)).toBe(true);
      expect(stats.athletes).toBe(stats.groups.reduce((total, group) => total + group.count, 0));
      expect(stats.own?.ageGroup).toBe(17);
      expect(stats.own?.best).toBe(Math.max(...stats.own!.results));
    }
    expect(samplePathwayStats("sprint").unit).toBe("mph");
    expect(samplePathwayStats("jump").unit).toBe("in");
    expect(samplePathwayStats("broadJump").unit).toBe("ft");
  });
});
