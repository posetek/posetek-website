import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { marketingActivityAllowed, subscribeMarketingActivity, useMarketingActivity } from "./marketing-activity";

afterEach(() => vi.unstubAllGlobals());

function environment() {
  const page = Object.assign(new EventTarget(), {
    hidden: false,
    documentElement: { dataset: {} as Record<string, string> },
  });
  const browser = new EventTarget();
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", browser);
  return { page, browser };
}

describe("marketing activity subscription", () => {
  it("reads a menu opened before hydration and stays paused until fully closed", () => {
    const { page } = environment();
    expect(marketingActivityAllowed()).toBe(true);
    for (const phase of ["opening", "open", "closing"]) {
      page.documentElement.dataset.marketingNavigation = phase;
      expect(marketingActivityAllowed()).toBe(false);
    }
    page.documentElement.dataset.marketingNavigation = "closed";
    expect(marketingActivityAllowed()).toBe(true);
    page.hidden = true;
    expect(marketingActivityAllowed()).toBe(false);
  });

  it("pauses native playback subscribers synchronously and removes both listeners", () => {
    const { page, browser } = environment();
    const states: boolean[] = [];
    const unsubscribe = subscribeMarketingActivity(() => states.push(marketingActivityAllowed()));
    page.documentElement.dataset.marketingNavigation = "opening";
    browser.dispatchEvent(new Event("marketing:navigation"));
    expect(states).toEqual([false]);
    page.documentElement.dataset.marketingNavigation = "closed";
    browser.dispatchEvent(new Event("marketing:navigation"));
    page.hidden = true;
    page.dispatchEvent(new Event("visibilitychange"));
    expect(states).toEqual([false, true, false]);
    unsubscribe();
    browser.dispatchEvent(new Event("marketing:navigation"));
    page.dispatchEvent(new Event("visibilitychange"));
    expect(states).toEqual([false, true, false]);
  });

  it("renders the server snapshot without document or window", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);
    function State() { return <span>{useMarketingActivity() ? "active" : "paused"}</span>; }
    expect(renderToStaticMarkup(<State />)).toBe("<span>paused</span>");
  });
});
