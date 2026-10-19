export const GALLERY_TEXTURE_LIMIT = 4;
export const GALLERY_BEND_STRENGTH = .34;
export const galleryBendTarget = (velocity: number) => GALLERY_BEND_STRENGTH * Math.min(Math.abs(velocity) / 45, 1);
export const dampGalleryValue = (value: number, target: number, seconds: number, rate: number) => target + (value - target) * Math.exp(-rate * seconds);

/** Native CSS-pixel movement, normalized to one 60 Hz frame independent of refresh rate. */
export function normalizedGalleryVelocity(delta: number, milliseconds: number): number {
  if (!Number.isFinite(delta) || !Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
  return Math.max(-45, Math.min(45, delta * (1000 / 60) / milliseconds));
}
