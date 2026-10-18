import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { RendererTelemetry, RendererView } from "./protocol";

export interface WorkerScene {
  scene: Scene;
  camera: PerspectiveCamera;
  update(view: RendererView, immediate?: boolean): void;
  resize(aspect: number): void;
  step(seconds: number): boolean;
  orbit(x: number, y: number): void;
  telemetry(): Omit<RendererTelemetry, "frames">;
  prepare?(renderer: WebGLRenderer): void;
  dispose(): void;
}
