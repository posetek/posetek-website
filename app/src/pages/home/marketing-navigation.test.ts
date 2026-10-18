import { afterEach, describe, expect, it, vi } from "vitest";
import { installMarketingNavigation } from "./marketing-navigation";

class TestElement extends EventTarget {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  classList = { add: vi.fn(), remove: vi.fn() };
  children: TestElement[] = [];
  parentElement: TestElement | null = null;
  selectors: Record<string, TestElement> = {};
  inert = false;
  open = false;
  hidden = false;
  tagName = "DIV";
  focus = vi.fn();
  querySelector(selector: string) { return this.selectors[selector] || null; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { this.attributes.delete(key); }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

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
});
