import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingGallery } from "./MarketingGallery";
import { attachMarketingGalleryMotion } from "./marketing-gallery";

class TestNode extends EventTarget {
  parent: TestNode | null = null;
  dataset: Record<string, string> = {};
  properties = new Map<string, string>();
  style = { gridRowEnd: "", setProperty: (key: string, value: string) => this.properties.set(key, value), removeProperty: (key: string) => { if (key === "grid-row-end") this.style.gridRowEnd = ""; else this.properties.delete(key); } };
  children: TestNode[] = [];
  gap: TestNode | null = null;
  offsetHeight = 100;
  marginTop = "0px";
  marginBottom = "0px";
  href = "";
  target = "";
  control = false;
  contains(other: TestNode | null): boolean { return other === this || !!other?.parent && this.contains(other.parent); }
  querySelectorAll() { return this.children; }
  querySelector() { return this.gap; }
  getBoundingClientRect() { return { top: 0, bottom: this.offsetHeight, width: 100, height: this.offsetHeight }; }
  hasAttribute() { return false; }
  closest(selector: string) { return selector === "a[href]" ? (this.href ? this : null) : (this.control ? this : null); }
}

class TestKeyboardEvent extends Event {
  key: string;
  constructor(key: string) { super("keydown"); this.key = key; }
}

function fixture({ hash = "", fine = true, reduce = false, wideLayout = true, navigationType = "navigate", readyState = "complete" } = {}) {
  const node = new TestNode(), card = new TestNode(), control = new TestNode(), gap = new TestNode(), secondCard = new TestNode();
  card.parent = node; control.parent = card; control.control = true; node.children = [card];
  gap.offsetHeight = 80; node.gap = gap; secondCard.parent = node; secondCard.offsetHeight = 240; secondCard.marginTop = "230px"; node.children.push(secondCard);
  const windowState = Object.assign(new EventTarget(), { scrollY: 0, innerHeight: 1000, scrollBy: vi.fn(), setTimeout, IntersectionObserver: null as unknown, ResizeObserver: null as unknown });
  const documentState = Object.assign(new EventTarget(), { hidden: false, readyState, activeElement: null as TestNode | null, getElementById: (_id: string): TestNode | null => null });
  const desktop = Object.assign(new EventTarget(), { matches: fine });
  const wide = Object.assign(new EventTarget(), { matches: wideLayout });
  const reduced = Object.assign(new EventTarget(), { matches: reduce });
  let visible: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const disconnect = vi.fn();
  class Observer { constructor(callback: typeof visible) { visible = callback; } observe() {} disconnect() { disconnect(); } }
  windowState.IntersectionObserver = Observer;
  let resized = () => {};
  class SizeObserver { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} }
  windowState.ResizeObserver = SizeObserver;
  const frames = new Map<number, FrameRequestCallback>(); let frameId = 0;
  vi.stubGlobal("window", windowState); vi.stubGlobal("document", documentState);
  vi.stubGlobal("location", new URL(`https://posetek.net/${hash}`));
  vi.stubGlobal("performance", { getEntriesByType: () => [{ type: navigationType }] });
  vi.stubGlobal("Element", TestNode); vi.stubGlobal("Node", TestNode); vi.stubGlobal("HTMLElement", TestNode); vi.stubGlobal("KeyboardEvent", TestKeyboardEvent);
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("ResizeObserver", SizeObserver);
  vi.stubGlobal("getComputedStyle", (item: TestNode) => ({ marginTop: item.marginTop, marginBottom: item.marginBottom, scrollMarginTop: "110px" }));
  vi.stubGlobal("matchMedia", (query: string) => query.includes("hover") ? desktop : query.includes("min-width") ? wide : reduced);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const destroy = attachMarketingGalleryMotion(node as unknown as HTMLElement);
  visible([{ isIntersecting: true }]);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); };
  const scroll = (y: number) => { windowState.scrollY = y; windowState.dispatchEvent(new Event("scroll")); flush(); };
  const drift = () => Number.parseFloat(node.properties.get("--gallery-drift") || "0");
  return { node, card, secondCard, control, windowState, documentState, desktop, wide, reduced, frames, flush, scroll, drift, destroy, disconnect, visible, resized: () => resized() };
}

afterEach(() => vi.unstubAllGlobals());

describe("marketing gallery native interaction boundaries", () => {
  it("renders the supplied chapters in source order without scripted placement", () => {
    const html = renderToStaticMarkup(<MarketingGallery><section id="first">First</section><section id="second">Second</section></MarketingGallery>);
    expect(html).toContain('data-gallery-motion="static"');
    expect(html.indexOf('id="first"')).toBeLessThan(html.indexOf('id="second"'));
    expect(html).not.toContain("transform");
    expect(html).not.toContain("data-gallery-gap");
    expect(html).toContain('data-gallery-layout="editorial"');
  });

  function mobileLanding(position = 99.73, options = {}) {
    const f = fixture({ hash: "#profile", fine: false, wideLayout: false, ...options });
    f.windowState.scrollY = 2333;
    let documentTop = f.windowState.scrollY + position;
    f.documentState.getElementById = () => f.secondCard;
    f.secondCard.getBoundingClientRect = () => {
      const top = documentTop - f.windowState.scrollY;
      return { top, bottom: top + 240, width: 358, height: 240 };
    };
    f.windowState.scrollBy.mockImplementation(({ top }: { top: number }) => { f.windowState.scrollY += top; });
    f.resized(); f.flush();
    return { ...f, grow: (pixels: number) => { documentTop += pixels; f.card.offsetHeight += pixels; f.resized(); f.flush(); } };
  }

  it.each([{ position: 99.73, history: false }, { position: 20, history: true }])("preserves a settled mobile fragment's relative position across late natural reflow: %j", ({ position, history }) => {
    const f = mobileLanding(position);
    f.windowState.dispatchEvent(new Event("scrollend"));
    if (history) { f.windowState.dispatchEvent(new Event("popstate")); f.windowState.dispatchEvent(new Event("scrollend")); }
    f.grow(266.25);
    expect(f.windowState.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 266.25, behavior: "instant" });
    expect(f.secondCard.getBoundingClientRect().top).toBeCloseTo(position);
    expect(f.node.dataset.galleryLayout).toBe("editorial");
    f.resized(); f.flush();
    expect(f.windowState.scrollBy).toHaveBeenCalledTimes(1);
    f.destroy();
  });

  it("defers mobile reflow correction until native fragment scrolling settles", () => {
    const f = mobileLanding(110);
    f.grow(266.25);
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    f.windowState.dispatchEvent(new Event("scrollend"));
    expect(f.windowState.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 266.25, behavior: "instant" });
    expect(f.secondCard.getBoundingClientRect().top).toBe(110);
    f.destroy();
  });

  it.each([[266.25], [100, 166.25]])("preserves an in-flight history landing through observed reflow %j", (...growth) => {
    const f = mobileLanding(20);
    f.windowState.dispatchEvent(new Event("scrollend"));
    f.windowState.dispatchEvent(new Event("popstate"));
    growth.forEach(pixels => f.grow(pixels));
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    f.windowState.dispatchEvent(new Event("scrollend"));
    expect(f.windowState.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 266.25, behavior: "instant" });
    expect(f.secondCard.getBoundingClientRect().top).toBe(20);
    f.resized(); f.flush();
    expect(f.windowState.scrollBy).toHaveBeenCalledTimes(1);
    f.destroy();
  });

  it.each(["wheel", "pointerdown", "focusin"])("releases mobile fragment correction after explicit %s takeover", eventName => {
    const f = mobileLanding(110);
    f.grow(100); // A correction is pending while the native scroll is active.
    if (eventName === "wheel") f.windowState.dispatchEvent(new Event(eventName));
    else {
      const event = new Event(eventName);
      Object.defineProperty(event, "target", { value: f.control });
      f.documentState.activeElement = f.control;
      f.node.dispatchEvent(event);
    }
    f.windowState.dispatchEvent(new Event("scrollend"));
    f.grow(266.25);
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    if (eventName !== "wheel") expect(f.documentState.activeElement).toBe(f.control);
    f.destroy();
  });

  it("retains the mobile fragment landing when navigation focuses its noninteractive heading", () => {
    const f = mobileLanding(110);
    const event = new Event("focusin");
    Object.defineProperty(event, "target", { value: f.secondCard });
    f.documentState.activeElement = f.secondCard; f.node.dispatchEvent(event);
    f.windowState.dispatchEvent(new Event("scrollend")); f.grow(266.25);
    expect(f.windowState.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 266.25, behavior: "instant" });
    expect(f.documentState.activeElement).toBe(f.secondCard);
    f.destroy();
  });

  it("keeps chapters in native flow at every viewport without scroll transforms or row spans", () => {
    const f = fixture();
    f.scroll(500); f.scroll(10_000);
    f.card.offsetHeight = 400; f.resized(); f.flush();
    f.wide.matches = false; f.windowState.dispatchEvent(new Event("resize")); f.flush();
    expect(f.node.dataset.galleryLayout).toBe("editorial");
    expect(f.node.dataset.galleryMotion).toBe("static");
    expect(f.card.style.gridRowEnd).toBe("");
    expect(f.secondCard.style.gridRowEnd).toBe("");
    expect(f.node.properties.size).toBe(0);
    expect(f.frames.size).toBe(0);
    expect(f.windowState.scrollBy).not.toHaveBeenCalled(); f.destroy();
  });

  it("does not canonicalize an initial native landing when no structural enhancement exists", () => {
    const f = mobileLanding(20);
    f.windowState.dispatchEvent(new Event("scrollend"));
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    expect(f.secondCard.getBoundingClientRect().top).toBe(20); f.destroy();
  });

  it("repairs only a reload's stale absolute restoration after pageshow and the next frame", () => {
    const f = mobileLanding(110, { navigationType: "reload", readyState: "loading" });
    f.windowState.dispatchEvent(new Event("scrollend")); // The hydration landing already finished.
    f.windowState.scrollY += 332; // Browser restores the older, taller document's position.
    f.windowState.dispatchEvent(new Event("scrollend"));
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    f.documentState.readyState = "complete";
    f.windowState.dispatchEvent(new Event("pageshow"));
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    f.flush();
    expect(f.windowState.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: -332, behavior: "instant" });
    expect(f.secondCard.getBoundingClientRect().top).toBe(110);
    f.grow(80);
    expect(f.secondCard.getBoundingClientRect().top).toBe(110);
    f.destroy();
  });

  it.each(["popstate", "persisted-pageshow"])("preserves a history-relative landing after %s instead of running the pending reload repair", eventName => {
    const f = mobileLanding(20, { navigationType: "reload", readyState: "loading" });
    f.documentState.readyState = "complete";
    const event = new Event(eventName === "popstate" ? "popstate" : "pageshow");
    if (eventName === "persisted-pageshow") Object.defineProperty(event, "persisted", { value: true });
    f.windowState.dispatchEvent(event); f.flush();
    f.windowState.dispatchEvent(new Event("scrollend"));
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    f.grow(266.25);
    expect(f.secondCard.getBoundingClientRect().top).toBe(20);
    f.destroy();
  });

  it.each(["wheel", "pointerdown"])("cancels reload repair after %s takeover even if pageshow arrives later", eventName => {
    const f = mobileLanding(110, { navigationType: "reload", readyState: "loading" });
    (eventName === "wheel" ? f.windowState : f.node).dispatchEvent(new Event(eventName));
    f.windowState.scrollY += 332;
    f.documentState.readyState = "complete";
    f.windowState.dispatchEvent(new Event("pageshow")); f.flush();
    f.windowState.dispatchEvent(new Event("scrollend")); f.grow(80);
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    f.destroy();
  });

  it("preserves a landing across both growth and collapse", () => {
    const f = mobileLanding(110); f.windowState.dispatchEvent(new Event("scrollend"));
    f.grow(220); f.grow(-160);
    expect(f.windowState.scrollBy).toHaveBeenNthCalledWith(1, { top: 220, behavior: "instant" });
    expect(f.windowState.scrollBy).toHaveBeenNthCalledWith(2, { top: -160, behavior: "instant" });
    expect(f.secondCard.getBoundingClientRect().top).toBe(110); f.destroy();
  });

  it("releases fragment stabilization for page scrolling keys but keeps native control keys alone", () => {
    const f = mobileLanding(110); f.windowState.dispatchEvent(new Event("scrollend"));
    const controlKey = new TestKeyboardEvent("ArrowDown");
    Object.defineProperty(controlKey, "target", { value: f.control });
    f.windowState.dispatchEvent(controlKey); f.grow(50);
    expect(f.windowState.scrollBy).toHaveBeenCalledOnce();
    f.windowState.dispatchEvent(new TestKeyboardEvent("PageDown")); f.grow(100);
    expect(f.windowState.scrollBy).toHaveBeenCalledOnce(); f.destroy();
  });

  it("seeds a new fragment independently without applying the old fragment's geometry", () => {
    const f = mobileLanding(110); f.windowState.dispatchEvent(new Event("scrollend"));
    f.documentState.getElementById = () => f.card;
    location.hash = "#tests"; f.windowState.dispatchEvent(new Event("hashchange"));
    f.resized(); f.flush(); f.windowState.dispatchEvent(new Event("scrollend"));
    expect(f.windowState.scrollBy).not.toHaveBeenCalled(); f.destroy();
  });

  it("defers hidden-document reflow and performs no idle animation loop", () => {
    const f = mobileLanding(110); f.windowState.dispatchEvent(new Event("scrollend"));
    f.documentState.hidden = true; f.documentState.dispatchEvent(new Event("visibilitychange"));
    f.grow(120); expect(f.frames.size).toBe(0);
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    f.documentState.hidden = false; f.documentState.dispatchEvent(new Event("visibilitychange")); f.flush();
    expect(f.windowState.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 120, behavior: "instant" });
    expect(f.frames.size).toBe(0); f.resized(); expect(f.frames.size).toBe(1);
    f.destroy(); expect(f.frames.size).toBe(0);
    f.resized(); expect(f.frames.size).toBe(0);
  });
});
