/** A visit chooses its accents once. Scrolling and texture residency never reroll them. */
export interface GalleryRevealProfile {
  duration: number;
  pixels: number;
  pauseAt: number;
  pauseLength: number;
  bendScale: number;
}

export function createGalleryRevealProfiles(ids: string[], seed: number): Map<string, GalleryRevealProfile> {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const pairs: [number, number][] = [];
  for (let first = 0; first < ids.length; first++) {
    for (let second = first + 2; second < ids.length; second++) pairs.push([first, second]);
  }
  const accents = new Set(pairs.length ? pairs[Math.floor(random() * pairs.length)] : []);
  return new Map(ids.map((id, index) => [id, {
    duration: .18 + random() * .18,
    pixels: accents.has(index) ? 12 + random() * 12 : 1,
    pauseAt: .15 + random() * .28,
    pauseLength: accents.has(index) ? .08 + random() * .09 : 0,
    bendScale: .82 + random() * .18,
  }]));
}

/** One short irregular hold, with continuous arrival and departure rather than frame skipping. */
export function galleryRevealProgress(progress: number, profile: GalleryRevealProfile): number {
  const p = Math.max(0, Math.min(1, progress));
  const { pauseAt: start, pauseLength: length } = profile;
  const moving = p < start ? p : p < start + length ? start : p - length;
  const linear = moving / (1 - length);
  return 1 - (1 - linear) ** 3;
}
