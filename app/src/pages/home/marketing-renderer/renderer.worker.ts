import { ACESFilmicToneMapping, AgXToneMapping, WebGLRenderer } from "three";
import { createBrandScene } from "./brand-scene";
import { createHeroScene } from "./hero-scene";
import type { RendererInput, RendererOutput, RendererSize, RendererView } from "./protocol";
import type { WorkerScene } from "./scene";

// Keep worker globals local; the application tsconfig intentionally uses DOM types.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RendererInput>) => void) | null;
  postMessage(message: RendererOutput): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  close(): void;
};
let renderer: WebGLRenderer | undefined, content: WorkerScene | undefined;
let view: RendererView, size: RendererSize, generation = 0, active = false, disposed = false, ready = false;
let frame = 0, previousTime = 0, frames = 0, lastTelemetry = 0, stage = "startup";
let revision = 0;
let appliedSize = "";
let resume: (() => void) | undefined;
const send = (message: RendererOutput) => { if (!disposed) scope.postMessage(message); };
const pause = () => { if (frame) scope.cancelAnimationFrame(frame); frame = previousTime = 0; };
const dispose = () => { pause(); disposed = true; resume?.(); resume = undefined; content?.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); };
const fail = (reason: string) => { if (disposed) return; send({ type: "failed", generation, stage, reason }); dispose(); scope.close(); };
const yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const eligible = async () => {
  // Process queued navigation/visibility messages between expensive GPU stages.
  await yieldTask();
  while (!active && !disposed) await new Promise<void>(resolve => { resume = resolve; });
  return !disposed;
};
const resize = () => {
  if (!renderer || !content) return;
  const key = `${size.width}:${size.height}:${size.dpr}`;
  if (key === appliedSize) return;
  appliedSize = key;
  renderer.setPixelRatio(size.dpr); renderer.setSize(size.width, size.height, false);
  content.resize(size.width / size.height);
};
const telemetry = () => send({ type: "frame", generation, telemetry: { frames, ...content!.telemetry() } });
const draw = (now: number) => {
  frame = 0;
  if (!active || !ready || disposed || !renderer || !content) return;
  try {
    content.update(view);
    const moving = content.step(previousTime ? Math.min(.05, (now - previousTime) / 1000) : 1 / 60);
    previousTime = moving ? now : 0;
    renderer.render(content.scene, content.camera); frames += 1;
    if (now - lastTelemetry >= 100 || !moving) { telemetry(); lastTelemetry = now; }
    if (moving) requestDraw();
  } catch { fail("draw"); }
};
const requestDraw = () => { if (active && ready && !disposed && !frame) frame = scope.requestAnimationFrame(draw); };

/** Poll GPU completion in the worker; never read pixels or synchronously wait. */
async function finishGpu() {
  // Three r186 creates WebGL2 contexts exclusively; its declared return type
  // still includes WebGL1. Fail truthfully if a future adapter violates that.
  const gl = renderer!.getContext() as WebGL2RenderingContext;
  if (typeof gl.fenceSync !== "function") throw new Error("gpu-completion-unsupported");
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) throw new Error("gpu-fence");
  gl.flush();
  try {
    while (!disposed) {
      const result = gl.clientWaitSync(fence, 0, 0);
      if (result === gl.WAIT_FAILED) throw new Error("gpu-completion");
      if (result === gl.ALREADY_SIGNALED || result === gl.CONDITION_SATISFIED) return;
      await new Promise(resolve => setTimeout(resolve, 16));
    }
  } finally { gl.deleteSync(fence); }
}

async function initialize(canvas: OffscreenCanvas) {
  try {
    if (!await eligible()) return;
    if (typeof scope.requestAnimationFrame !== "function") { fail("worker-animation-unsupported"); return; }
    stage = "context";
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: view.kind === "hero" ? "high-performance" : "low-power" });
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = () => { throw new Error("shader-link"); };
    canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); fail("context-lost"); });
    renderer.toneMapping = view.kind === "hero" ? AgXToneMapping : ACESFilmicToneMapping;
    if (view.kind === "brand") { renderer.toneMappingExposure = 1.1; renderer.setClearColor(0x04130e, 0); }
    if (!await eligible()) return;
    stage = "geometry";
    content = view.kind === "hero" ? createHeroScene(view) : createBrandScene(view);
    resize();
    if (!await eligible()) return;
    stage = "environment"; content.prepare?.(renderer);
    if (!await eligible()) return;
    stage = "shaders";
    await renderer.compileAsync(content.scene, content.camera);
    if (!await eligible()) return;
    // Warm every hero material (including both transparent ball sides) before
    // hiding unused figures. The transferred canvas still has zero opacity.
    stage = "warmup";
    renderer.render(content.scene, content.camera); frames += 1;
    await finishGpu();
    if (!await eligible()) return;
    stage = "first-frame";
    // A pose/size can change while the GPU is preparing. Do not acknowledge a
    // stale frame or crossfade back from the visible SVG to an earlier pose.
    let renderedRevision: number;
    do {
      renderedRevision = revision;
      content.update(view, true); content.step(0); resize();
      renderer.render(content.scene, content.camera); frames += 1;
      await finishGpu();
      if (!await eligible()) return;
    } while (renderedRevision !== revision);
    ready = true; stage = "render";
    const gl = renderer.getContext(), info = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    send({ type: "ready", generation, frames, gpu }); telemetry(); requestDraw();
  } catch (error) { if (!disposed) fail(error instanceof Error && error.message === "shader-link" ? "shader-link" : "initialization"); }
}

scope.onmessage = event => {
  const message = event.data;
  if (disposed) return;
  if (message.type === "init") {
    if (generation) return;
    generation = message.generation; view = message.view; size = message.size; active = message.active;
    void initialize(message.canvas);
  } else if (message.type === "dispose") { dispose(); scope.close(); }
  else if (message.type === "activity") {
    active = message.active;
    if (!active) pause();
    else { resume?.(); resume = undefined; requestDraw(); }
  } else if (message.type === "view") { view = message.view; revision += 1; requestDraw(); }
  else if (message.type === "resize") {
    size = message.size; revision += 1;
    if (active && ready) { try { resize(); requestDraw(); } catch { fail("resize"); } }
  } else if (message.type === "orbit" && active && ready) { content?.orbit(message.x, message.y); requestDraw(); }
};
