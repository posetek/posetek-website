import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkerRenderer } from "./adapter";
import type { RendererInput, RendererOutput, HeroView } from "./protocol";

class FakeCanvas {
  dataset: Record<string, string> = {};
  style = { opacity: "", visibility: "", display: "", removeProperty(property: "visibility" | "display") { this[property] = ""; } };
  remove = vi.fn();
  setAttribute = vi.fn();
  transferControlToOffscreen() { return { transferred: true }; }
}
class FakeWorker {
  static instances: FakeWorker[] = [];
  messages: RendererInput[] = [];
  onmessage?: (event: { data: RendererOutput }) => void;
  onerror?: (event: { preventDefault(): void }) => void;
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: RendererInput) { this.messages.push(message); }
  emit(message: Omit<Extract<RendererOutput, { type: "ready" }>, "generation">) {
    const init = this.messages[0] as Extract<RendererInput, { type: "init" }>;
    this.onmessage?.({ data: { ...message, generation: init.generation } });
  }
}
const view: HeroView = { kind: "hero", pose: "shooting", layer: "skeleton", reducedMotion: false, rotating: false, command: 0, action: "reset" };
let page: { hidden: boolean; documentElement: { dataset: Record<string, string> }; createElement: () => FakeCanvas };
const host = () => ({ clientWidth: 600, clientHeight: 420, dataset: {}, appendChild: vi.fn() }) as unknown as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  FakeWorker.instances = [];
  page = { hidden: false, documentElement: { dataset: {} }, createElement: () => new FakeCanvas() };
  vi.stubGlobal("document", page); vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas); vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("ResizeObserver", undefined); vi.stubGlobal("devicePixelRatio", 2);
  vi.stubGlobal("requestAnimationFrame", () => 1); vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("worker renderer admission and truthful readiness", () => {
  it("does not create a worker until visible eligibility and closed navigation agree", () => {
    const state = vi.fn(), renderer = createWorkerRenderer(host(), view, { state, ready: vi.fn() });
    renderer.setActive(false);
    page.documentElement.dataset.marketingNavigation = "opening"; renderer.setActive(true);
    expect(FakeWorker.instances).toHaveLength(0);
    page.documentElement.dataset.marketingNavigation = "closed"; renderer.setActive(true);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].messages[0]).toMatchObject({ type: "init", view: { pose: "shooting" }, size: { width: 600, height: 420, dpr: 1.75 } });
    expect(state).toHaveBeenLastCalledWith("preparing"); renderer.destroy();
  });
  it("retains the same worker and state through menu suspension; import alone is not ready", () => {
    const ready = vi.fn(), element = host(), renderer = createWorkerRenderer(element, view, { state: vi.fn(), ready });
    renderer.setActive(true); const worker = FakeWorker.instances[0];
    expect(ready).not.toHaveBeenCalled();
    renderer.setActive(false); renderer.update({ ...view, pose: "jump" });
    worker.emit({ type: "ready", frames: 2, gpu: "test-device" });
    expect(ready).not.toHaveBeenCalled(); expect(element.dataset.rendererFrames).toBe("2");
    renderer.setActive(true);
    expect(ready).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(1); expect(worker.terminate).not.toHaveBeenCalled();
    expect(worker.messages).toContainEqual({ type: "view", view: { ...view, pose: "jump" } }); renderer.destroy();
  });
  it("keeps GPU preparation hidden, then lets component reduced-motion CSS own canvas visibility", () => {
    const canvas = new FakeCanvas(); page.createElement = () => canvas;
    const renderer = createWorkerRenderer(host(), view, { state: vi.fn(), ready: vi.fn() });
    renderer.setActive(true);
    expect(canvas.style).toMatchObject({ opacity: "0", visibility: "hidden", display: "block" });
    FakeWorker.instances[0].emit({ type: "ready", frames: 2, gpu: "test-device" });
    expect(canvas.style).toMatchObject({ opacity: "1", visibility: "", display: "" });
    renderer.setActive(false);
    expect(canvas.style.visibility).toBe(""); expect(canvas.style.display).toBe("");
    expect(FakeWorker.instances).toHaveLength(1);
    renderer.destroy();
  });
  it("fails after ten cumulative active seconds, excluding a long menu pause", () => {
    const state = vi.fn(), renderer = createWorkerRenderer(host(), view, { state, ready: vi.fn() });
    renderer.setActive(true); vi.advanceTimersByTime(6000); renderer.setActive(false);
    vi.advanceTimersByTime(60_000); expect(FakeWorker.instances[0].terminate).not.toHaveBeenCalled();
    renderer.setActive(true); vi.advanceTimersByTime(3999); expect(FakeWorker.instances[0].terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(state).toHaveBeenLastCalledWith("failed", "startup-timeout");
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce(); renderer.destroy();
  });
  it("ignores a late ready reply after teardown and never starts a replacement implicitly", () => {
    const ready = vi.fn(), renderer = createWorkerRenderer(host(), view, { state: vi.fn(), ready });
    renderer.setActive(true); const worker = FakeWorker.instances[0]; renderer.destroy();
    worker.emit({ type: "ready", frames: 2, gpu: "late" }); renderer.setActive(true);
    expect(ready).not.toHaveBeenCalled(); expect(FakeWorker.instances).toHaveLength(1);
  });
  it("keeps a static failure when OffscreenCanvas is unsupported instead of probing WebGL", () => {
    vi.stubGlobal("HTMLCanvasElement", class {});
    const state = vi.fn(), element = host(), renderer = createWorkerRenderer(element, view, { state, ready: vi.fn() });
    renderer.setActive(true);
    expect(state).toHaveBeenLastCalledWith("failed", "unsupported");
    expect(FakeWorker.instances).toHaveLength(0); expect(element.appendChild).not.toHaveBeenCalled(); renderer.destroy();
  });
});
