import { describe, expect, it } from "vitest";
import { createGalleryRevealProfiles, galleryRevealProgress } from "./gallery-reveal";

const chapters = ["tests", "profile", "training", "ai-coach", "technique", "mobile-app"];

describe("fluid chapter reveals", () => {
  it("selects exactly two nonadjacent accents, with bounded brief durations", () => {
    for (let seed = 0; seed < 100; seed++) {
      const profiles = [...createGalleryRevealProfiles(chapters, seed).values()];
      const accents = profiles.flatMap((profile, index) => profile.pixels > 1 ? [index] : []);
      expect(accents).toHaveLength(2);
      expect(accents[1] - accents[0]).toBeGreaterThan(1);
      for (const profile of profiles) {
        expect(profile.duration).toBeGreaterThanOrEqual(.18);
        expect(profile.duration).toBeLessThanOrEqual(.36);
        expect(profile.pixels).toBeLessThanOrEqual(24);
        expect(profile.bendScale).toBeGreaterThanOrEqual(.82);
        expect(profile.bendScale).toBeLessThanOrEqual(1);
      }
    }
  });
  it("replays a visit exactly and changes chapter choices across different visit seeds", () => {
    const visit = createGalleryRevealProfiles(chapters, 8127);
    expect(createGalleryRevealProfiles(chapters, 8127)).toEqual(visit);
    const selected = (seed: number) => [...createGalleryRevealProfiles(chapters, seed)].filter(([, profile]) => profile.pixels > 1).map(([id]) => id).join(",");
    expect(new Set([1, 1987, 18274, 51365, 147693].map(selected)).size).toBeGreaterThan(2);
    expect(new Set([...visit.values()].map(profile => profile.duration)).size).toBe(chapters.length);
  });
  it("clears monotonically, holds briefly only on accents, and ends sharply", () => {
    for (const profile of createGalleryRevealProfiles(chapters, 91637).values()) {
      expect(galleryRevealProgress(0, profile)).toBe(0);
      expect(galleryRevealProgress(1, profile)).toBe(1);
      let previous = 0;
      for (let frame = 1; frame <= 1000; frame++) {
        const progress = galleryRevealProgress(frame / 1000, profile);
        expect(progress).toBeGreaterThanOrEqual(previous);
        expect(progress - previous).toBeLessThan(.005);
        previous = progress;
      }
      if (profile.pixels > 1) {
        expect(galleryRevealProgress(profile.pauseAt, profile)).toBeCloseTo(galleryRevealProgress(profile.pauseAt + profile.pauseLength, profile));
      } else expect(profile.pauseLength).toBe(0);
    }
  });
});
