import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mesh, type WebGLRenderer } from "three";
import { createGalleryScene } from "./gallery-scene";
import { dampGalleryValue, galleryBendTarget, normalizedGalleryVelocity } from "./gallery-model";
import type { GalleryCard, GalleryView } from "./protocol";
import { createGalleryRevealProfiles } from "./gallery-reveal";

const card = (id: string, y = 100): GalleryCard => ({ id, src: `https://example.test/${id}.webp`, x: 40, y, width: 600, height: 450, hovered: false, pointerX: 0, pointerY: 0, settled: false, revealEpoch: 0 });
const view = (cards = [card("one")]): GalleryView => ({ kind: "gallery", revision: 1, scrollRevision: 0, width: 1440, height: 1000, scrollX: 0, scrollY: 0, velocity: 0, cards });
const fakeRenderer = () => ({ autoClear: true, setScissorTest: vi.fn(), setScissor: vi.fn(), clear: vi.fn(), render: vi.fn() }) as unknown as WebGLRenderer;
let bitmaps: Array<{ width: number; height: number; close: ReturnType<typeof vi.fn> }>;
beforeEach(() => {
  bitmaps = [];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob() })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => { const bitmap = { width: 1200, height: 900, close: vi.fn() }; bitmaps.push(bitmap); return bitmap; }));
});
afterEach(() => vi.unstubAllGlobals());

describe("gallery motion model", () => {
  it("uses time-normalized native velocity, bounded at the reference curvature", () => {
    expect(normalizedGalleryVelocity(20, 1000 / 60)).toBeCloseTo(normalizedGalleryVelocity(10, 1000 / 120));
    expect(normalizedGalleryVelocity(1000, 1)).toBe(45);
    expect(galleryBendTarget(-45)).toBe(.34);
    expect(galleryBendTarget(500)).toBe(.34);
    expect(normalizedGalleryVelocity(20, 0)).toBe(0);
    expect(normalizedGalleryVelocity(NaN, 16)).toBe(0);
    expect(dampGalleryValue(0, 1, .1, 10)).toBeGreaterThan(dampGalleryValue(0, 1, .1, 4));
  });
});

describe("one gallery scene with bounded textures", () => {
  it("uses sharp smooth chapters and brief accent blends without changing the legacy reveal policy", async () => {
    const profiles = createGalleryRevealProfiles(["a", "b", "c", "d", "e", "f"], 18274);
    const accent = [...profiles].find(([, profile]) => profile.pixels > 1)!;
    const smooth = [...profiles].find(([, profile]) => profile.pixels === 1)!;
    const scene = createGalleryScene(view([
      { ...card(accent[0]), revealProfile: accent[1] },
      { ...card(smooth[0], 500), revealProfile: smooth[1] }, card("legacy", 300),
    ]), vi.fn());
    await scene.prepare?.(fakeRenderer()); scene.step(.05);
    const uniforms = scene.scene.children.map(child => (child as Mesh<never, { uniforms: Record<string, { value: number }> } & import("three").Material>).material.uniforms);
    expect(uniforms[0].uFluidReveal.value).toBe(1); expect(uniforms[0].uRevealPixels.value).toBeGreaterThan(1);
    expect(uniforms[1].uRevealPixels.value).toBe(1); expect(uniforms[2].uFluidReveal.value).toBe(0);
    scene.step(.32);
    expect(scene.telemetry().galleryReveals!.filter(reveal => reveal.id !== "legacy").every(reveal => reveal.complete)).toBe(true);
    expect(scene.telemetry().galleryReveals!.find(reveal => reveal.id === "legacy")!.complete).toBe(false);
    expect(uniforms[0].uRevealPixels.value).toBe(1); scene.dispose();
  });
  it("loads at most four textures and only acknowledges meshes actually drawn in the viewport", async () => {
    const scene = createGalleryScene(view([card("a"), card("b", 600), card("c", 1400), card("d", -500), card("e")]), vi.fn());
    await scene.prepare?.(fakeRenderer()); scene.step(0);
    expect(fetch).toHaveBeenCalledTimes(4);
    const mesh = scene.scene.children[0] as Mesh;
    expect(mesh.geometry.getAttribute("position").count).toBe(66);
    scene.render?.(fakeRenderer());
    expect(scene.telemetry()).toMatchObject({ galleryCards: ["a", "b"], galleryTextures: 4, galleryRevision: 1 });
    scene.dispose(); expect(bitmaps.every(bitmap => bitmap.close.mock.calls.length === 1)).toBe(true);
  });
  it("has actual curvature uniforms during native scroll and stops scheduling after settling", async () => {
    const scene = createGalleryScene(view(), vi.fn()); await scene.prepare?.(fakeRenderer());
    scene.update({ ...view(), scrollRevision: 1, velocity: 45 });
    expect(scene.step(1 / 60)).toBe(true);
    expect(scene.telemetry().bend).toBeGreaterThan(0);
    let moving = true;
    for (let i = 0; i < 360; i++) moving = scene.step(1 / 60);
    expect(scene.telemetry().bend).toBe(0); expect(moving).toBe(false);
    scene.dispose();
  });
  it("tilts and pulses only the hovered artwork and cancels its blur on exit", async () => {
    const scene = createGalleryScene(view(), vi.fn()); await scene.prepare?.(fakeRenderer());
    scene.update(view([{ ...card("one"), hovered: true, pointerX: 1, pointerY: .5, settled: true }])); scene.step(.16);
    const mesh = scene.scene.children[0] as Mesh<never, { uniforms: Record<string, { value: number }> } & import("three").Material>;
    expect(mesh.rotation.y).toBeGreaterThan(0); expect(mesh.material.uniforms.uBlur.value).toBeGreaterThan(0);
    expect(mesh.material.uniforms.uZoom.value).toBeGreaterThan(1);
    scene.update(view([card("one")])); scene.step(.016);
    expect(mesh.material.uniforms.uBlur.value).toBe(0); scene.dispose();
  });
  it("clears transient curvature on suspension without completing unrelated reveal progress", async () => {
    const scene = createGalleryScene(view(), vi.fn()); await scene.prepare?.(fakeRenderer());
    scene.update({ ...view(), scrollRevision: 1, velocity: 45 }); scene.step(.04);
    expect(scene.telemetry().bend).toBeGreaterThan(0);
    const progress = scene.telemetry().galleryReveals![0].progress;
    scene.pause?.(); expect(scene.telemetry().bend).toBe(0);
    expect(scene.telemetry().galleryReveals![0].progress).toBe(progress); scene.dispose();
  });
  it("retains completed reveal state across texture eviction and resets only for a new directional epoch", async () => {
    const scene = createGalleryScene(view(), vi.fn()); await scene.prepare?.(fakeRenderer()); scene.step(1);
    expect(scene.telemetry().galleryReveals).toContainEqual({ id: "one", epoch: 0, progress: 1, complete: true });
    scene.update(view([])); expect(scene.telemetry().galleryTextures).toBe(0);
    scene.update(view()); await scene.prepare?.(fakeRenderer()); scene.step(0);
    expect(scene.telemetry().galleryReveals).toContainEqual({ id: "one", epoch: 0, progress: 1, complete: true });
    scene.update(view([{ ...card("one"), revealEpoch: 1 }])); scene.step(0);
    expect(scene.telemetry().galleryReveals).toContainEqual({ id: "one", epoch: 1, progress: 0, complete: false }); scene.dispose();
  });
  it("prefetches a nearby texture without spending its reveal before actual viewport entry", async () => {
    const scene = createGalleryScene(view([card("one", 1050)]), vi.fn()); await scene.prepare?.(fakeRenderer());
    expect(scene.step(2)).toBe(false);
    expect(scene.telemetry().galleryReveals![0].progress).toBe(0);
    scene.update({ ...view([card("one", 1050)]), scrollY: 100 });
    expect(scene.step(.1)).toBe(true); expect(scene.telemetry().galleryReveals![0].progress).toBeGreaterThan(0); scene.dispose();
  });
  it("keeps failed images in DOM fallback and does not retry a broken source on every scroll", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    const scene = createGalleryScene(view(), vi.fn()); await scene.prepare?.(fakeRenderer()); scene.render?.(fakeRenderer());
    expect(scene.telemetry()).toMatchObject({ galleryCards: [], galleryFailed: ["one"] });
    scene.update(view([])); scene.update(view()); await scene.prepare?.(fakeRenderer());
    expect(fetch).toHaveBeenCalledTimes(1); scene.dispose();
  });
  it("discards an asynchronously decoded bitmap if its card was evicted before it arrived", async () => {
    let finish: ((bitmap: ImageBitmap) => void) | undefined;
    vi.mocked(createImageBitmap).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const scene = createGalleryScene(view(), vi.fn());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    scene.update(view([]));
    expect(scene.telemetry()).toMatchObject({ galleryCancelled: ["one"], galleryFailed: [], galleryPending: [] });
    const close = vi.fn(); finish?.({ width: 1200, height: 900, close } as unknown as ImageBitmap);
    await Promise.resolve(); await Promise.resolve();
    expect(close).toHaveBeenCalledOnce(); expect(scene.telemetry().galleryTextures).toBe(0); scene.dispose();
  });
});
