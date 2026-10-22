import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachMarketingShowcaseMotion } from "./marketing-showcase-motion";
import type { GalleryView, RendererState, RendererTelemetry } from "./marketing-renderer/protocol";

const factory = vi.hoisted(() => vi.fn());
vi.mock("./marketing-renderer/adapter", () => ({ createWorkerRenderer: factory }));

class ElementStub extends EventTarget {
  dataset: Record<string, string> = {};
  style = Object.assign({} as Record<string, unknown>, { setProperty: (key: string, value: string) => { this.style[key] = value; } });
  image?: { currentSrc: string; src: string };
  frames: ElementStub[] = [];
  expandedPanel?: ElementStub;
  interactive = false;
  focusVisible = true;
  rect = { left: 40, top: 100, width: 600, height: 450 };
  remove = vi.fn(); setAttribute = vi.fn(); prepend = vi.fn();
  querySelector(selector: string) { return selector.includes("data-showcase-panel") ? this.expandedPanel : this.image; }
  querySelectorAll() { return this.frames; }
  getBoundingClientRect() { return this.rect; }
  contains(node: unknown) { return node === this || this.frames.includes(node as ElementStub); }
  closest(selector: string) { return selector.includes("data-showcase-frame") || this.interactive ? this : null; }
  matches() { return this.focusVisible; }
}
class Media extends EventTarget { matches: boolean; constructor(matches: boolean) { super(); this.matches = matches; } }
class Observer {
  static instances: Observer[] = [];
  observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
  callback: () => void;
  constructor(callback: () => void) { this.callback = callback; Observer.instances.push(this); }
}
let root: ElementStub, overlay: ElementStub, browser: EventTarget;
let page: EventTarget & { hidden: boolean; activeElement: ElementStub | null; documentElement: { dataset: Record<string, string> }; createElement: () => ElementStub; elementFromPoint: ReturnType<typeof vi.fn> };
let reduced: Media, fine: Media, desktop: Media;
let raf: Map<number, FrameRequestCallback>, nextRaf: number;
let callbacks: { state(state: RendererState): void; ready(): void; frame(telemetry: RendererTelemetry): void };
let renderer: { update: ReturnType<typeof vi.fn>; setActive: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
const flush = () => { const scheduled = [...raf.values()]; raf.clear(); for (const fn of scheduled) fn(performance.now()); };
const latest = () => renderer.update.mock.lastCall![0] as GalleryView;
const deliver = (extra: Partial<RendererTelemetry> = {}) => callbacks.frame({ frames: 3, galleryRevision: latest().revision, galleryScrollY: latest().scrollY, galleryScrollX: 0, galleryCards: ["one"], galleryTextures: 1, bend: 0,
  galleryReveals: latest().cards.map(card => ({ id: card.id, epoch: card.revealEpoch, progress: card.settled ? 1 : .5, complete: card.settled })), ...extra });
const inputOn = (target: ElementStub, type = "pointerdown") => { const event = new Event(type); Object.defineProperty(event, "target", { value: target }); root.dispatchEvent(event); };
const moveScroll = (y: number) => { vi.advanceTimersByTime(16); vi.stubGlobal("scrollY", y); browser.dispatchEvent(new Event("scroll")); flush(); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance"] }); nextRaf = 0; raf = new Map(); Observer.instances = [];
  root = new ElementStub(); overlay = new ElementStub();
  const frame = new ElementStub(); frame.dataset.showcaseFrame = "one"; frame.image = { src: "https://example.test/one.webp", currentSrc: "" }; root.frames = [frame];
  reduced = new Media(false); fine = new Media(true); desktop = new Media(true); browser = new EventTarget();
  page = Object.assign(new EventTarget(), { hidden: false, activeElement: null, documentElement: { dataset: {} }, createElement: () => overlay, elementFromPoint: vi.fn(() => null) });
  renderer = { update: vi.fn(), setActive: vi.fn(), destroy: vi.fn() };
  factory.mockImplementation((_host, _view, events) => { callbacks = events; return renderer; });
  vi.stubGlobal("window", browser); vi.stubGlobal("document", page);
  vi.stubGlobal("innerWidth", 1440); vi.stubGlobal("innerHeight", 1000); vi.stubGlobal("scrollX", 0); vi.stubGlobal("scrollY", 0);
  vi.stubGlobal("location", { href: "https://example.test/", origin: "https://example.test" });
  vi.stubGlobal("matchMedia", (query: string) => query.includes("reduced") ? reduced : query.includes("min-width") ? desktop : fine);
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { const id = ++nextRaf; raf.set(id, fn); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => raf.delete(id));
  vi.stubGlobal("ResizeObserver", Observer); vi.stubGlobal("MutationObserver", undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); factory.mockReset(); });

describe("showcase progressive worker controller", () => {
  it("waits for a real current-layout card frame, not a worker ready message or another card", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush();
    expect(root.frames[0].dataset.showcaseRenderer).toBe("pending"); callbacks.ready();
    expect(root.frames[0].dataset.showcaseRenderer).toBe("pending");
    deliver({ galleryRevision: 0 }); expect(root.frames[0].dataset.showcaseRenderer).toBe("pending");
    deliver({ galleryCards: ["other"] }); expect(root.frames[0].dataset.showcaseRenderer).toBe("static");
    deliver(); expect(root.frames[0].dataset.showcaseRenderer).toBe("ready"); expect(overlay.style.visibility).toBe("visible"); cleanup();
  });
  it.each(["touch", "narrow", "reduced"])("never activates a gallery renderer for %s presentation", kind => {
    if (kind === "touch") fine.matches = false;
    if (kind === "narrow") desktop.matches = false;
    if (kind === "reduced") reduced.matches = true;
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush();
    expect(renderer.setActive).toHaveBeenLastCalledWith(false); expect(root.dataset.showcaseMotion).toBe("static");
    expect(root.frames[0].dataset.showcaseRenderer).toBe("static"); cleanup();
  });
  it("restores fallback synchronously on menu intent and rejects a late frame until a new eligible draw", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver();
    page.documentElement.dataset.marketingNavigation = "opening"; browser.dispatchEvent(new Event("marketing:navigation"));
    expect(root.frames[0].dataset.showcaseRenderer).toBe("static"); expect(overlay.style.visibility).toBe("hidden");
    deliver(); expect(overlay.style.visibility).toBe("hidden");
    page.documentElement.dataset.marketingNavigation = "closed"; browser.dispatchEvent(new Event("marketing:navigation")); flush();
    expect(factory).toHaveBeenCalledOnce(); expect(overlay.style.visibility).toBe("hidden");
    deliver(); expect(overlay.style.visibility).toBe("visible"); cleanup();
  });
  it("changes to static on live reduced motion and retains the same renderer for restoration", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver();
    reduced.matches = true; reduced.dispatchEvent(new Event("change")); flush();
    expect(root.frames[0].dataset.showcaseRenderer).toBe("static"); expect(renderer.setActive).toHaveBeenLastCalledWith(false);
    reduced.matches = false; reduced.dispatchEvent(new Event("change")); flush(); deliver();
    expect(factory).toHaveBeenCalledOnce(); expect(root.frames[0].dataset.showcaseRenderer).toBe("ready"); cleanup();
  });
  it("settles the first input immediately and rejects a previously queued decorative frame", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver();
    const oldRevision = latest().revision;
    inputOn(root.frames[0]);
    expect(root.frames[0].dataset.showcaseRenderer).toBe("static"); expect(renderer.setActive).toHaveBeenLastCalledWith(false);
    deliver({ galleryRevision: oldRevision }); expect(overlay.style.visibility).toBe("hidden");
    flush(); deliver({ galleryRevision: oldRevision }); expect(overlay.style.visibility).toBe("hidden");
    expect(latest().cards[0].settled).toBe(true); cleanup();
  });
  it("invalidates stale geometry and does not endlessly reobserve unchanged frame elements", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver();
    const oldRevision = latest().revision, observer = Observer.instances[0];
    expect(observer.observe).toHaveBeenCalledTimes(2);
    root.frames[0].rect.top = 300; observer.callback(); flush();
    expect(latest().cards[0].y).toBe(300); expect(observer.observe).toHaveBeenCalledTimes(2); expect(raf.size).toBe(0);
    deliver({ galleryRevision: oldRevision }); expect(overlay.style.visibility).toBe("hidden"); cleanup();
  });
  it("keeps an acknowledged frame visible through no-op image load and resize notifications", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver();
    const revision = latest().revision;
    root.dispatchEvent(new Event("load")); Observer.instances[0].callback(); flush();
    expect(latest().revision).toBe(revision);
    expect(root.frames[0].dataset.showcaseRenderer).toBe("ready");
    expect(overlay.style.visibility).toBe("visible"); cleanup();
  });
  it("restores only a replaced responsive image while keeping another aligned plane visible", () => {
    const second = new ElementStub(); second.dataset.showcaseFrame = "two"; second.rect.top = 600;
    second.image = { src: "https://example.test/two.webp", currentSrc: "" }; root.frames.push(second);
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver({ galleryCards: ["one", "two"] });
    const oldRevision = latest().revision;
    second.image.currentSrc = "https://example.test/two-large.webp";
    root.dispatchEvent(new Event("load")); flush();
    expect(latest().revision).toBeGreaterThan(oldRevision);
    expect(root.frames[0].dataset.showcaseRenderer).toBe("ready"); expect(second.dataset.showcaseRenderer).toBe("static");
    expect(overlay.style.visibility).toBe("visible");
    deliver({ galleryRevision: oldRevision, galleryCards: ["one", "two"] });
    expect(second.dataset.showcaseRenderer).toBe("static");
    deliver({ galleryCards: ["one", "two"] }); expect(second.dataset.showcaseRenderer).toBe("ready"); cleanup();
  });
  it("retains the visit's selected profiles through resize, scrolling, and directional rearming", () => {
    root.dataset.showcaseMotionPolicy = "fluid";
    root.frames = ["tests", "profile", "training", "ai-coach", "technique", "mobile-app"].map((id, index) => {
      const element = new ElementStub(); element.dataset.showcaseFrame = id; element.rect.top = 100 + index * 500;
      element.image = { src: `https://example.test/${id}.webp`, currentSrc: "" }; return element;
    });
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush();
    const original = latest().cards[0].revealProfile;
    expect(original).toBeDefined();
    moveScroll(2000); moveScroll(0);
    root.frames[0].rect.width = 610; Observer.instances[0].callback(); flush();
    expect(latest().cards[0].revealProfile).toEqual(original); cleanup();
  });
  it("coalesces native scroll and compensates the last drawn canvas without transforming anchors", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver();
    vi.advanceTimersByTime(16); vi.stubGlobal("scrollY", 20); browser.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(16); vi.stubGlobal("scrollY", 40); browser.dispatchEvent(new Event("scroll"));
    expect(raf.size).toBe(1); expect(overlay.style.transform).toBe("translate3d(0px, -40px, 0)");
    flush(); expect(latest().velocity).toBeGreaterThan(0); expect(root.frames[0].style.transform).toBeUndefined(); cleanup();
  });
  it("pauses while offscreen or a preview control has focus without destroying retained state", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver();
    root.frames[0].interactive = true; page.activeElement = root.frames[0]; root.dispatchEvent(new Event("focusin")); flush();
    expect(renderer.setActive).toHaveBeenLastCalledWith(false); expect(root.frames[0].dataset.showcaseRenderer).toBe("static");
    page.activeElement = null; vi.stubGlobal("scrollY", 2000); browser.dispatchEvent(new Event("scroll")); flush();
    expect(renderer.setActive).toHaveBeenLastCalledWith(false); expect(renderer.destroy).not.toHaveBeenCalled(); cleanup();
  });
  it("does not suppress later reading for a programmatically focused heading or mouse-focused close opener", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush();
    page.activeElement = root.frames[0]; root.dispatchEvent(new Event("focusin")); flush();
    expect(renderer.setActive).toHaveBeenLastCalledWith(true);
    root.frames[0].interactive = true; root.frames[0].focusVisible = false;
    root.dispatchEvent(new Event("focusin")); flush(); expect(renderer.setActive).toHaveBeenLastCalledWith(true);
    root.frames[0].focusVisible = true; root.dispatchEvent(new Event("focusin")); flush();
    expect(renderer.setActive).toHaveBeenLastCalledWith(false); cleanup();
  });
  it("pauses all decorative rendering while an inline full demo is open even without focused controls", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver();
    root.expandedPanel = new ElementStub(); browser.dispatchEvent(new Event("marketing-gallery-position")); flush();
    expect(renderer.setActive).toHaveBeenLastCalledWith(false); expect(root.frames[0].dataset.showcaseRenderer).toBe("static");
    root.expandedPanel = undefined; browser.dispatchEvent(new Event("marketing-gallery-position")); flush();
    expect(renderer.setActive).toHaveBeenLastCalledWith(true); cleanup();
  });
  it("hit-tests a stationary pointer after native scroll instead of retaining a departed card's hover", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush();
    const frame = root.frames[0]; page.elementFromPoint.mockReturnValue(frame);
    const move = new Event("pointermove");
    Object.defineProperty(move, "target", { value: frame }); Object.assign(move, { clientX: 300, clientY: 300, pointerType: "mouse", buttons: 0 });
    browser.dispatchEvent(move); flush(); expect(latest().cards[0].hovered).toBe(true);
    page.elementFromPoint.mockReturnValue(null); vi.advanceTimersByTime(16); vi.stubGlobal("scrollY", 80); browser.dispatchEvent(new Event("scroll")); flush();
    expect(latest().cards[0].hovered).toBe(false); expect(page.elementFromPoint).toHaveBeenLastCalledWith(300, 300); cleanup();
  });
  it("tracks the pointer over the hero without scheduling frames, then activates a card wheeled beneath it", () => {
    root.frames[0].rect.top = 1500;
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush();
    const hero = new ElementStub();
    const move = new Event("pointermove"); Object.defineProperty(move, "target", { value: hero });
    Object.assign(move, { clientX: 300, clientY: 300, pointerType: "mouse", buttons: 0 });
    browser.dispatchEvent(move); expect(raf.size).toBe(0);
    page.elementFromPoint.mockReturnValue(root.frames[0]); moveScroll(1300);
    expect(latest().cards[0].hovered).toBe(true);
    root.dispatchEvent(new Event("pointerleave")); flush();
    page.elementFromPoint.mockReturnValue(null); moveScroll(0);
    page.elementFromPoint.mockReturnValue(root.frames[0]); moveScroll(1300);
    expect(latest().cards[0].hovered).toBe(true); expect(page.elementFromPoint).toHaveBeenLastCalledWith(300, 300); cleanup();
  });
  it.each(["blur", "pointerout", "touch"])("clears stationary pointer coordinates after %s rather than inventing a later hover", type => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush();
    const move = new Event("pointermove"); Object.defineProperty(move, "target", { value: root.frames[0] });
    Object.assign(move, { clientX: 300, clientY: 300, pointerType: "mouse", buttons: 0 });
    page.elementFromPoint.mockReturnValue(root.frames[0]); browser.dispatchEvent(move); flush(); expect(latest().cards[0].hovered).toBe(true);
    const event = new Event(type === "touch" ? "pointerdown" : type);
    if (type === "touch") Object.assign(event, { pointerType: "touch" });
    if (type === "pointerout") Object.assign(event, { relatedTarget: null });
    browser.dispatchEvent(event); flush(); moveScroll(20);
    expect(latest().cards[0].hovered).toBe(false); cleanup();
  });
  it("preserves passed/completed cards after eviction and rearms only on a full exit below", () => {
    root.frames[0].rect.top = 1500;
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush();
    expect(root.frames[0].dataset.showcaseReveal).toBe("armed");
    moveScroll(1000); callbacks.ready(); deliver({ galleryReveals: [{ id: "one", epoch: 0, progress: 1, complete: true }] });
    expect(root.frames[0].dataset.showcaseReveal).toBe("complete");
    moveScroll(2200); expect(latest().cards).toHaveLength(0);
    moveScroll(1000); expect(latest().cards[0]).toMatchObject({ settled: true, revealEpoch: 0 });
    moveScroll(400); expect(root.frames[0].dataset.showcaseRevealEpoch).toBe("1"); expect(root.frames[0].dataset.showcaseReveal).toBe("armed");
    moveScroll(300); expect(root.frames[0].dataset.showcaseRevealEpoch).toBe("1");
    moveScroll(1000); expect(latest().cards[0]).toMatchObject({ settled: false, revealEpoch: 1 });
    deliver({ galleryReveals: [{ id: "one", epoch: 0, progress: 1, complete: true }] });
    expect(root.frames[0].dataset.showcaseRenderer).toBe("static"); expect(root.frames[0].dataset.showcaseReveal).toBe("armed");
    deliver(); expect(root.frames[0].dataset.showcaseReveal).toBe("revealing"); cleanup();
  });
  it("finishes an interrupted card that passes above even without a completion acknowledgment", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready(); deliver();
    expect(root.frames[0].dataset.showcaseReveal).toBe("revealing"); moveScroll(1600); moveScroll(0);
    expect(latest().cards[0]).toMatchObject({ settled: true, revealEpoch: 0 }); cleanup();
  });
  it("settles only the interacted chapter and leaves unvisited cards eligible for their own reveal", () => {
    const second = new ElementStub(); second.dataset.showcaseFrame = "two"; second.rect.top = 750;
    second.image = { src: "https://example.test/two.webp", currentSrc: "" }; root.frames.push(second);
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush();
    inputOn(root.frames[0]); flush();
    expect(latest().cards.find(card => card.id === "one")?.settled).toBe(true);
    expect(latest().cards.find(card => card.id === "two")?.settled).toBe(false);
    expect(second.dataset.showcaseReveal).toBe("armed"); cleanup();
  });
  it("keeps failed sources visible and releases observers, frames and worker at teardown", () => {
    const cleanup = attachMarketingShowcaseMotion(root as unknown as HTMLElement); flush(); callbacks.ready();
    deliver({ galleryCards: [], galleryFailed: ["one"] }); expect(root.frames[0].dataset.showcaseRenderer).toBe("failed");
    callbacks.state("failed"); expect(overlay.style.visibility).toBe("hidden");
    cleanup(); expect(renderer.destroy).toHaveBeenCalledOnce(); expect(overlay.remove).toHaveBeenCalledOnce();
    expect(Observer.instances[0].disconnect).toHaveBeenCalledOnce(); expect(raf.size).toBe(0);
    deliver(); expect(root.frames[0].dataset.showcaseRenderer).toBe("static");
  });
});
