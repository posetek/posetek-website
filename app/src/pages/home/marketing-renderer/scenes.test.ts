/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Group } from "three";
import { createBrandGeometry } from "./brand-scene";
import { createHeroScene } from "./hero-scene";
import approvedShape from "./brand-shape.json";
import type { HeroView } from "./protocol";

const view: HeroView = { kind: "hero", pose: "shooting", layer: "skeleton", reducedMotion: false, rotating: false, command: 0, action: "reset" };
describe("worker scene parity", () => {
  it("retains the exact approved badge commands and finite extruded geometry", () => {
    const source = readFileSync(new URL("../../../../astro/public/brand/posetek-p.svg", import.meta.url));
    expect(createHash("sha256").update(source).digest("hex")).toBe(approvedShape.sha256);
    const path = source.toString().match(/<path\b[^>]*\bd="([^"]+)"/)![1];
    expect(approvedShape.commands.flat().map(String)).toEqual(path.match(/[MLQZ]|-?\d+(?:\.\d+)?/g));
    const geometry = createBrandGeometry();
    expect(Array.from(geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    geometry.computeBoundingBox(); expect(geometry.boundingBox!.max.x).toBeGreaterThan(.9); expect(geometry.boundingBox!.max.z).toBeGreaterThan(.15); geometry.dispose();
  });
  it("warms every pose family then shows the selected pose without a stale first-frame fade", () => {
    const scene = createHeroScene(view);
    const figures = scene.scene.children.filter(child => child instanceof Group);
    expect(figures).toHaveLength(3); expect(figures.every(figure => figure.visible)).toBe(true);
    scene.update({ ...view, pose: "jump" }, true); scene.step(0);
    expect(figures.map(figure => figure.visible)).toEqual([false, false, true]); scene.dispose();
  });
  it("preserves keyboard camera commands, drag rotation, and pause without time catch-up", () => {
    const scene = createHeroScene(view), original = scene.telemetry().position;
    scene.orbit(.1, 0); expect(scene.telemetry().position).not.toEqual(original);
    scene.update({ ...view, command: 1, action: "reset" }); expect(scene.telemetry().position).toEqual(original);
    scene.update({ ...view, command: 2, action: "left" }); expect(scene.telemetry().angle).toBeLessThan(.48);
    const paused = scene.telemetry().position; scene.step(.05); expect(scene.telemetry().position).toEqual(paused);
    scene.update({ ...view, command: 2, rotating: true }); scene.step(.05); expect(scene.telemetry().position).not.toEqual(paused); scene.dispose();
  });
});
