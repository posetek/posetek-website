import type { PitchView, Point3 } from "../latest-hero/pose-model";

export type NavigationPhase = "closed" | "opening" | "open" | "closing";
export type RendererState = "queued" | "preparing" | "ready" | "paused" | "failed";
export interface BrandView { kind: "brand"; x: number; y: number; rise: number; }
export interface HeroView extends PitchView { kind: "hero"; }
export type RendererView = HeroView | BrandView;
export interface RendererSize { width: number; height: number; dpr: number; }
export type RendererInput =
  | { type: "init"; generation: number; canvas: OffscreenCanvas; size: RendererSize; view: RendererView; active: boolean }
  | { type: "activity"; active: boolean }
  | { type: "resize"; size: RendererSize }
  | { type: "view"; view: RendererView }
  | { type: "orbit"; x: number; y: number }
  | { type: "dispose" };
export interface RendererTelemetry {
  frames: number;
  angle?: number;
  position?: Point3;
  target?: Point3;
  tiltX?: number;
  tiltY?: number;
  rise?: number;
  settling?: boolean;
}
export type RendererOutput =
  | { type: "ready"; generation: number; frames: number; gpu: string }
  | { type: "frame"; generation: number; telemetry: RendererTelemetry }
  | { type: "failed"; generation: number; stage: string; reason: string };

/** This contract is emitted by the eager header before React has hydrated. */
export function navigationIsClosed(): boolean {
  return !document.documentElement.dataset.marketingNavigation || document.documentElement.dataset.marketingNavigation === "closed";
}

export function subscribeNavigation(listener: () => void): () => void {
  window.addEventListener("marketing:navigation", listener);
  return () => window.removeEventListener("marketing:navigation", listener);
}
