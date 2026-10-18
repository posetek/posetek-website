import { afterEach, describe, expect, it, vi } from "vitest";
import { installMarketingNavigation } from "./marketing-navigation";
import { enhanceMarketingHeader } from "./marketing-header-enhancements";

class TestElement extends EventTarget {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  classList = { add: vi.fn(), remove: vi.fn() };
  children: TestElement[] = [];
  parentElement: TestElement | null = null;
  selectors: Record<string, TestElement> = {};
  collections: Record<string, TestElement[]> = {};
  properties = new Map<string, string>();
  style = { setProperty: (key: string, value: string) => this.properties.set(key, value), removeProperty: (key: string) => this.properties.delete(key), transform: "" };
  computed = { transform: "none", opacity: "1", paddingRight: "3px" };
  offsetWidth = 300;
  offsetHeight = 225;
  textContent: string | null = "";
  inert = false;
  open = false;
  hidden = false;
  tagName = "DIV";
  focus = vi.fn();
  querySelector(selector: string) { return this.selectors[selector] || null; }
  querySelectorAll(selector: string) { return this.collections[selector] || []; }
  getAttribute(key: string) { return this.attributes.get(key) || null; }
  closest(selector: string) { return this.selectors[`closest:${selector}`] || null; }
  matches() { return false; }
  getBoundingClientRect() { return { right: 900, top: 300, height: 100 }; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { this.attributes.delete(key); }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function navigationEnvironment() {
  vi.useFakeTimers();
  const shell = new TestElement(), header = new TestElement(), details = new TestElement();
  const opener = new TestElement(), panel = new TestElement(), close = new TestElement(), bar = new TestElement();
  shell.children = [header]; header.parentElement = shell;
  header.selectors = { details, ".pt-marketing-menu": panel, "[data-menu-close]": close, ".pt-marketing-bar": bar };
  details.selectors = { summary: opener };
  close.selectors["closest:[data-menu-close]"] = close;
  const page = Object.assign(new EventTarget(), {
    body: { style: { overflow: "scroll", paddingRight: "3px" } },
    documentElement: { dataset: {}, clientWidth: 1440 }, hidden: false, getElementById: () => null,
  });
  const browser = Object.assign(new EventTarget(), { setTimeout, setInterval });
  const motion = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("document", page); vi.stubGlobal("window", browser);
  vi.stubGlobal("HTMLElement", TestElement); vi.stubGlobal("Element", TestElement);
  vi.stubGlobal("matchMedia", () => motion); vi.stubGlobal("innerWidth", 1440); vi.stubGlobal("innerHeight", 1000);
  vi.stubGlobal("getComputedStyle", (node: TestElement) => node.computed || { paddingRight: "3px" });
  vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
  return { header, opener, panel, close, page, browser, motion };
}

describe("early navigation modal ownership", () => {
  it("inerts a later streamed root and restores each sibling's original state", () => {
    vi.useFakeTimers();
    const shell = new TestElement(), header = new TestElement(), details = new TestElement();
    const opener = new TestElement(), panel = new TestElement(), close = new TestElement(), bar = new TestElement();
    const existing = new TestElement(); existing.inert = true;
    shell.children = [header, existing]; header.parentElement = shell;
    header.selectors = { details, ".pt-marketing-menu": panel, "[data-menu-close]": close, ".pt-marketing-bar": bar };
    details.selectors = { summary: opener };
    const page = Object.assign(new EventTarget(), {
      body: { style: { overflow: "scroll", paddingRight: "3px" } },
      documentElement: { dataset: {}, clientWidth: 980 }, hidden: false,
      getElementById: () => null,
    });
    const browser = Object.assign(new EventTarget(), { setTimeout });
    const motion = Object.assign(new EventTarget(), { matches: false });
    let notify = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("document", page); vi.stubGlobal("window", browser);
    vi.stubGlobal("HTMLElement", TestElement); vi.stubGlobal("matchMedia", () => motion);
    vi.stubGlobal("innerWidth", 1000); vi.stubGlobal("getComputedStyle", () => ({ paddingRight: "3px" }));
    vi.stubGlobal("MutationObserver", class {
      constructor(callback: () => void) { notify = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const cleanup = installMarketingNavigation(header as unknown as HTMLElement);
    opener.dispatchEvent(new Event("click", { cancelable: true }));
    expect(close.focus).toHaveBeenCalled(); expect(bar.inert).toBe(true);
    const streamed = new TestElement(); shell.children.push(streamed); notify();
    expect(streamed.inert).toBe(true);
    close.dispatchEvent(new Event("click")); vi.advanceTimersByTime(400);
    expect(streamed.inert).toBe(false); expect(existing.inert).toBe(true); expect(bar.inert).toBe(false);
    expect(page.body.style).toEqual({ overflow: "scroll", paddingRight: "3px" });
    expect(disconnect).toHaveBeenCalledOnce(); expect(opener.focus).toHaveBeenCalled();
    cleanup?.();
  });

  it("closes from the interrupted visible frame without revealing delayed content", () => {
    const { header, opener, panel, page } = navigationEnvironment();
    const slice = new TestElement(), letter = new TestElement(), content = new TestElement();
    slice.computed.transform = "matrix(1, 0, 0, 0.07, 0, 0)";
    letter.computed.transform = "matrix(1, 0, 0, 1, 0, 120)";
    content.computed.opacity = "0";
    panel.collections = { ".pt-menu-curtain-slice": [slice], ".pt-menu-letter": [letter], ":scope > :not(.pt-menu-curtain)": [content] };
    const operations: string[] = [];
    vi.stubGlobal("getComputedStyle", (node: TestElement) => { operations.push("read"); return node.computed || { paddingRight: "3px" }; });
    for (const node of [slice, letter, content]) {
      const write = node.style.setProperty;
      node.style.setProperty = (key, value) => { operations.push("write"); return write(key, value); };
    }
    const cleanup = installMarketingNavigation(header as unknown as HTMLElement);
    opener.dispatchEvent(new Event("click")); vi.advanceTimersByTime(120);
    operations.length = 0;
    page.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" }));
    expect(operations).toEqual(["read", "read", "read", "write", "write", "write"]);
    expect(slice.properties.get("--curtain-exit-from")).toBe(slice.computed.transform);
    expect(letter.properties.get("--letter-exit-from")).toBe(letter.computed.transform);
    expect(content.properties.get("--content-exit-from")).toBe("0");
    expect(header.dataset.navigation).toBe("closing");
    vi.advanceTimersByTime(399); expect(panel.hidden).toBe(false);
    vi.advanceTimersByTime(1); expect(panel.hidden).toBe(true);
    expect(header.dataset.navigation).toBe("closed"); expect(slice.properties.size).toBe(0);
    cleanup?.();
  });

  it("keeps an early pointer press on Close from completing the opening first", () => {
    const { header, opener, panel, close } = navigationEnvironment();
    const cleanup = installMarketingNavigation(header as unknown as HTMLElement);
    opener.dispatchEvent(new Event("click"));
    const down = new Event("pointerdown"); Object.defineProperty(down, "target", { value: close });
    panel.dispatchEvent(down);
    expect(panel.dataset.letterReveal).toBe("true");
    close.dispatchEvent(new Event("click"));
    expect(header.dataset.navigation).toBe("closing");
    vi.advanceTimersByTime(400); expect(panel.hidden).toBe(true);
    cleanup?.();
  });
});

describe("menu destination preview lifecycle", () => {
  function environment() {
    const context = navigationEnvironment();
    const { header } = context;
    const peek = new TestElement(), link = new TestElement(), title = new TestElement(), caption = new TestElement();
    peek.dataset.visible = "false"; peek.selectors = { "[data-peek-title]": title, "[data-peek-caption]": caption };
    link.dataset = { menuPage: "players", previewTitle: "Start with evidence.", previewCaption: "Your game." };
    link.attributes.set("aria-label", "Players");
    header.selectors[".pt-menu-peek"] = peek; header.collections["[data-menu-page]"] = [link];
    const frames = new Map<number, FrameRequestCallback>(); let id = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => frames.delete(handle));
    class Pointer extends Event { pointerType = "mouse"; clientX = 800; clientY = 400; }
    vi.stubGlobal("PointerEvent", Pointer);
    vi.stubGlobal("matchMedia", (query: string) => Object.assign(new EventTarget(), { matches: !query.includes("reduced-motion") }));
    const tick = () => { const current = [...frames.values()]; frames.clear(); current.forEach(callback => callback(0)); };
    return { ...context, peek, link, frames, Pointer, tick };
  }

  it("ignores hidden-menu focus and seeds a new preview before making it visible", () => {
    const { header, peek, link, frames, tick } = environment();
    header.dataset.navigation = "closed";
    const cleanup = enhanceMarketingHeader(header as unknown as HTMLElement);
    link.dispatchEvent(new Event("focus"));
    expect(peek.dataset.visible).toBe("false"); expect(frames.size).toBe(0);
    header.dataset.navigation = "open"; link.dispatchEvent(new Event("focus"));
    tick(); expect(peek.style.transform).not.toBe("");
    expect(peek.dataset.positioned).toBe("false"); expect(peek.dataset.visible).toBe("false");
    tick(); expect(peek.dataset.positioned).toBe("true"); expect(peek.dataset.visible).toBe("true");
    link.dispatchEvent(new Event("pointerleave"));
    expect(peek.dataset.visible).toBe("false");
    expect(peek.dataset.positioned).toBe("true"); // Preserve its CSS fade-out until the next seed.
    cleanup();
  });

  it("coalesces pointer moves and cancels a queued preview when navigation closes", () => {
    const { header, panel, peek, link, browser, frames, Pointer, tick } = environment();
    header.dataset.navigation = "open";
    const cleanup = enhanceMarketingHeader(header as unknown as HTMLElement);
    link.dispatchEvent(new Pointer("pointerenter"));
    for (const clientX of [810, 820, 830]) panel.dispatchEvent(Object.assign(new Pointer("pointermove"), { clientX }));
    expect(frames.size).toBe(1); tick();
    expect(peek.style.transform).toBe("translate3d(856px,253.75px,0)");
    header.dataset.navigation = "closing"; browser.dispatchEvent(new Event("marketing:navigation"));
    tick(); expect(peek.dataset.visible).toBe("false"); expect(frames.size).toBe(0);
    expect(link.dataset.dimmed).toBe("false"); cleanup();
  });
});
