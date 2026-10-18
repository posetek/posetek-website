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

function fixture({ hash = "", fine = true, reduce = false } = {}) {
  const node = new TestNode(), card = new TestNode(), control = new TestNode(), gap = new TestNode(), secondCard = new TestNode();
  card.parent = node; control.parent = card; control.control = true; node.children = [card];
  gap.offsetHeight = 80; node.gap = gap; secondCard.parent = node; secondCard.offsetHeight = 240; secondCard.marginTop = "230px"; node.children.push(secondCard);
  const windowState = Object.assign(new EventTarget(), { scrollY: 0, innerHeight: 1000, scrollBy: vi.fn(), setTimeout, IntersectionObserver: null as unknown, ResizeObserver: null as unknown });
  const documentState = Object.assign(new EventTarget(), { hidden: false, activeElement: null as TestNode | null, getElementById: (_id: string): TestNode | null => null });
  const desktop = Object.assign(new EventTarget(), { matches: fine });
  const wide = Object.assign(new EventTarget(), { matches: true });
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
  it("renders the supplied sections in the same order without a scripted layout", () => {
    const html = renderToStaticMarkup(<MarketingGallery><section id="first">First</section><section id="second">Second</section></MarketingGallery>);
    expect(html).toContain('data-gallery-motion="static"');
    expect(html.indexOf('id="first"')).toBeLessThan(html.indexOf('id="second"'));
    expect(html).not.toContain("transform");
  });

  it("drifts four pixels per hundred scroll pixels with a bounded offset and no idle RAF", () => {
    const f = fixture(); f.scroll(100); expect(f.drift()).toBe(-4);
    f.scroll(1000); expect(f.drift()).toBe(-40); expect(f.frames.size).toBe(0);
    f.scroll(10_000); expect(f.drift()).toBe(-160);
    f.scroll(0); expect(f.drift()).toBe(0); f.destroy();
  });

  it("preserves pending drift when ordinary scrollend arrives before the draw RAF", () => {
    const f = fixture({ hash: "#profile" });
    f.scroll(991);
    f.windowState.dispatchEvent(new Event("wheel"));
    f.windowState.scrollY = 1291;
    f.windowState.dispatchEvent(new Event("scroll"));
    expect(f.frames.size).toBe(1);
    f.windowState.dispatchEvent(new Event("scrollend"));
    expect(f.frames.size).toBe(1);
    f.flush();
    expect(f.drift()).toBe(-12);
    expect(f.node.dataset.galleryMotion).toBe("active");
    expect(f.frames.size).toBe(0);
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    f.destroy();
  });

  it("reserves each independent card's natural height, initial stagger and CSS gap without growth", () => {
    const f = fixture();
    expect(f.node.dataset.galleryLayout).toBe("masonry");
    expect(f.card.style.gridRowEnd).toBe("span 180");
    expect(f.secondCard.style.gridRowEnd).toBe("span 550");
    f.card.offsetHeight = 210; f.resized(); f.flush(); expect(f.card.style.gridRowEnd).toBe("span 290");
    f.resized(); f.flush(); expect(f.card.style.gridRowEnd).toBe("span 290"); expect(f.frames.size).toBe(0);
    f.wide.matches = false; f.wide.dispatchEvent(new Event("change")); f.flush();
    expect(f.node.dataset.galleryLayout).toBeUndefined(); expect(f.card.style.gridRowEnd).toBe(""); expect(f.secondCard.style.gridRowEnd).toBe(""); f.destroy();
  });

  it("cancels queued motion before pointer interaction and never catches up on leave", () => {
    const f = fixture(); f.scroll(500);
    f.windowState.scrollY = 600; f.windowState.dispatchEvent(new Event("scroll"));
    expect(f.frames.size).toBe(1);
    f.card.dispatchEvent(new Event("pointerenter")); f.flush();
    expect(f.frames.size).toBe(0); expect(f.drift()).toBe(-20);
    f.scroll(1600); expect(f.drift()).toBe(-20);
    f.card.dispatchEvent(new Event("pointerleave")); expect(f.drift()).toBe(-20);
    f.scroll(1700); expect(f.drift()).toBe(-24); f.destroy();
  });

  it("keeps a focused control stationary through scrolling and releases without a jump", async () => {
    const f = fixture(); f.scroll(500);
    f.documentState.activeElement = f.control; f.node.dispatchEvent(new Event("focusin"));
    f.scroll(1400); expect(f.drift()).toBe(-20);
    f.documentState.activeElement = null; f.node.dispatchEvent(new Event("focusout")); await Promise.resolve();
    expect(f.drift()).toBe(-20); f.scroll(1500); expect(f.drift()).toBe(-24); f.destroy();
  });

  it("holds initial deep-link landing until explicit scroll intent, without replaying its travel", () => {
    const f = fixture({ hash: "#profile" }); f.scroll(1600); expect(f.drift()).toBe(0);
    f.windowState.dispatchEvent(new Event("wheel")); expect(f.drift()).toBe(0);
    f.scroll(1700); expect(f.drift()).toBe(-4);
    f.windowState.dispatchEvent(new Event("popstate")); f.scroll(500); expect(f.drift()).toBe(-4);
    f.windowState.dispatchEvent(new TestKeyboardEvent("PageDown")); f.scroll(600); expect(f.drift()).toBe(-8); f.destroy();
  });

  it("waits for native fragment scrolling to settle before correcting a resized landing", () => {
    const f = fixture({ hash: "#profile" });
    f.documentState.getElementById = () => f.card;
    f.windowState.scrollY = 500;
    f.card.getBoundingClientRect = () => ({ top: 250, bottom: 450, width: 100, height: 200 });
    f.card.offsetHeight = 200; f.resized(); f.flush();
    expect(f.windowState.scrollBy).not.toHaveBeenCalled();
    f.windowState.dispatchEvent(new Event("scrollend"));
    expect(f.windowState.scrollBy).toHaveBeenCalledWith({ top: 140, behavior: "instant" }); f.destroy();
  });

  it("abandons delayed fragment correction as soon as the user takes over scrolling", () => {
    const f = fixture({ hash: "#profile" });
    f.documentState.getElementById = () => f.card;
    f.windowState.scrollY = 500; f.card.offsetHeight = 200; f.resized(); f.flush();
    f.windowState.dispatchEvent(new Event("wheel"));
    f.windowState.dispatchEvent(new Event("scrollend"));
    expect(f.windowState.scrollBy).not.toHaveBeenCalled(); f.destroy();
  });

  it("locks before a same-document anchor default action while preserving modified clicks", () => {
    const f = fixture(); f.scroll(500);
    const anchor = new TestNode(); anchor.href = "https://posetek.net/#second";
    const click = (modified: boolean) => {
      const event = new Event("click"); Object.defineProperty(event, "target", { value: anchor });
      Object.assign(event, { button: 0, ctrlKey: modified }); f.documentState.dispatchEvent(event);
    };
    click(true); f.scroll(600); expect(f.drift()).toBe(-24);
    click(false); f.scroll(1500); expect(f.drift()).toBe(-24); expect(f.node.dataset.galleryMotion).toBe("locked"); f.destroy();
  });

  it("pauses hidden and offscreen work without accumulating drift, and cleans up queued frames", () => {
    const f = fixture(); f.scroll(100);
    f.documentState.hidden = true; f.documentState.dispatchEvent(new Event("visibilitychange"));
    f.scroll(800); expect(f.drift()).toBe(-4); expect(f.frames.size).toBe(0);
    f.documentState.hidden = false; f.documentState.dispatchEvent(new Event("visibilitychange"));
    f.scroll(900); expect(f.drift()).toBe(-8);
    f.visible([{ isIntersecting: false }]); f.scroll(1900); expect(f.drift()).toBe(-8);
    f.visible([{ isIntersecting: true }]); f.scroll(2000); expect(f.drift()).toBe(-12);
    f.windowState.scrollY = 2100; f.windowState.dispatchEvent(new Event("scroll")); f.destroy();
    expect(f.frames.size).toBe(0); expect(f.disconnect).toHaveBeenCalledOnce();
    expect(f.node.properties.has("--gallery-drift")).toBe(false);
  });

  it.each([{ fine: false }, { reduce: true }])("leaves motion static for %j and responds to live preference changes", options => {
    const f = fixture(options); f.scroll(1000); expect(f.drift()).toBe(0); expect(f.frames.size).toBe(0);
    f.desktop.matches = true; f.reduced.matches = false; f.desktop.dispatchEvent(new Event("change"));
    f.scroll(1100); expect(f.drift()).toBe(-4);
    f.reduced.matches = true; f.reduced.dispatchEvent(new Event("change"));
    expect(f.drift()).toBe(0); expect(f.node.dataset.galleryMotion).toBe("static"); f.destroy();
  });
});
