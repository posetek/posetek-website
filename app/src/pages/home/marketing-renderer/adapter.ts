import { activeBudget } from "./active-budget";
import { navigationIsClosed, type RendererInput, type RendererOutput, type RendererState, type RendererTelemetry, type RendererView } from "./protocol";

let nextGeneration = 0;
interface Callbacks {
  state: (state: RendererState, reason?: string) => void;
  ready: () => void;
  frame?: (telemetry: RendererTelemetry) => void;
}

/** DOM-only adapter: even the WebGL capability probe lives in the worker. */
export function createWorkerRenderer(host: HTMLElement, initial: RendererView, callbacks: Callbacks) {
  const generation = ++nextGeneration;
  let worker: Worker | undefined, canvas: HTMLCanvasElement | undefined;
  let view = initial, active = false, ready = false, presented = false, failed = false, disposed = false, resizeFrame = 0;
  let lastSize = "";
  const post = (message: RendererInput) => { if (worker && !disposed && !failed) worker.postMessage(message); };
  const size = () => ({ width: Math.max(1, Math.round(host.clientWidth)), height: Math.max(1, Math.round(host.clientHeight)), dpr: Math.min(devicePixelRatio || 1, view.kind === "hero" ? 1.75 : 1.5) });
  const fail = (reason: string) => {
    if (disposed || failed) return;
    failed = true; ready = false; budget.stop(); worker?.terminate(); worker = undefined;
    canvas?.remove(); canvas = undefined;
    host.dataset.rendererFailure = reason;
    callbacks.state("failed", reason);
  };
  const budget = activeBudget(() => fail("startup-timeout"));
  const present = () => {
    if (!ready || presented || !active || document.hidden || !navigationIsClosed()) return;
    presented = true;
    if (canvas) {
      canvas.style.opacity = "1";
      // Initial GPU preparation stays hidden. After presentation, component CSS
      // owns static/reduced-motion visibility rather than an inline override.
      canvas.style.removeProperty("visibility");
      canvas.style.removeProperty("display");
    }
    callbacks.ready();
  };
  const receive = (event: MessageEvent<RendererOutput>) => {
    const message = event.data;
    if (disposed || failed || message.generation !== generation) return;
    if (message.type === "failed") { fail(`${message.stage}:${message.reason}`); return; }
    if (message.type === "frame") {
      host.dataset.rendererFrames = String(message.telemetry.frames);
      callbacks.frame?.(message.telemetry);
    } else if (message.type === "ready") {
      ready = true; budget.stop();
      host.dataset.rendererFrames = String(message.frames);
      host.dataset.rendererGpu = message.gpu;
      present(); callbacks.state(active ? "ready" : "paused");
    }
  };
  const start = () => {
    if (worker || failed || disposed || !active || document.hidden || !navigationIsClosed()) return;
    callbacks.state("preparing");
    try {
      if (typeof Worker === "undefined" || typeof HTMLCanvasElement.prototype.transferControlToOffscreen !== "function") { fail("unsupported"); return; }
      canvas = document.createElement("canvas");
      canvas.dataset.marketingWorkerCanvas = view.kind;
      canvas.setAttribute("aria-hidden", "true");
      Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", opacity: "0", visibility: "hidden" });
      host.appendChild(canvas);
      worker = new Worker(new URL("./renderer.worker.ts", import.meta.url), { type: "module", name: `posetek-${view.kind}` });
      worker.onmessage = receive;
      worker.onerror = event => { event.preventDefault(); fail("worker-error"); };
      worker.onmessageerror = () => fail("worker-message-error");
      const offscreen = canvas.transferControlToOffscreen();
      const dimensions = size(); lastSize = JSON.stringify(dimensions);
      worker.postMessage({ type: "init", generation, canvas: offscreen, size: dimensions, view, active } satisfies RendererInput, [offscreen]);
      budget.setActive(true);
    } catch { fail("worker-start"); }
  };
  const resize = () => {
    if (resizeFrame || disposed) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!active || !worker) return;
      const dimensions = size(), key = JSON.stringify(dimensions);
      if (key !== lastSize) { lastSize = key; post({ type: "resize", size: dimensions }); }
    });
  };
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
  observer?.observe(host); window.addEventListener("resize", resize);
  host.dataset.rendererOwner = "worker";
  host.dataset.rendererFrames = "0";
  callbacks.state("queued");
  return {
    update(next: RendererView) { view = next; post({ type: "view", view }); },
    orbit(x: number, y: number) { if (active && ready) post({ type: "orbit", x, y }); },
    setActive(next: boolean) {
      active = next && !document.hidden && navigationIsClosed();
      if (disposed || failed) return;
      if (!worker) { if (active) start(); return; }
      post({ type: "activity", active });
      if (!ready) budget.setActive(active);
      present();
      callbacks.state(active ? ready ? "ready" : "preparing" : "paused");
      if (active) resize();
    },
    destroy() {
      if (disposed) return;
      post({ type: "dispose" }); disposed = true; budget.stop();
      cancelAnimationFrame(resizeFrame); observer?.disconnect(); window.removeEventListener("resize", resize);
      worker?.terminate(); worker = undefined; canvas?.remove(); canvas = undefined;
    },
  };
}
