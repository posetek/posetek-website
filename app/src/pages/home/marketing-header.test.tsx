import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingHeader, TEAM_ENQUIRY_HREF } from "./MarketingHeader";

describe("marketing audience navigation", () => {
  it.each(["players", "coaches"] as const)("exposes real routes and one current page for %s", audience => {
    const html = renderToStaticMarkup(<MarketingHeader audience={audience} />);
    expect(html).toContain('role="group" aria-label="Explore PoseTek for"');
    expect(html).toContain(`<a href="/"${audience === "players" ? ' aria-current="page"' : ""}>Players</a>`);
    expect(html).toContain(`<a href="/coaches"${audience === "coaches" ? ' aria-current="page"' : ""}>Coaches</a>`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("preserves player section and booking destinations", () => {
    const html = renderToStaticMarkup(<MarketingHeader audience="players" />);
    for (const hash of ["tests", "profile", "training", "ai-coach", "technique"]) expect(html).toContain(`href="#${hash}"`);
    expect(html).toContain('href="/bookPerformanceTest.html"');
    expect(html).not.toContain(TEAM_ENQUIRY_HREF);
  });

  it("offers team enquiries and coach sign-in without application imports", () => {
    const html = renderToStaticMarkup(<MarketingHeader audience="coaches" />);
    for (const hash of ["club", "players", "development", "contact"]) expect(html).toContain(`href="#${hash}"`);
    expect(html).toContain(`href="${TEAM_ENQUIRY_HREF}"`);
    expect(html).toContain("Talk about your team");
    expect(html).toContain('href="/signin">Coach sign in');
    expect(html).not.toContain('href="/bookPerformanceTest.html"');
  });

  it("connects the collapsed menu button to its disclosure", () => {
    const html = renderToStaticMarkup(<MarketingHeader audience="coaches" />);
    const controlled = html.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controlled).toBeTruthy();
    expect(html).toContain(`id="${controlled}"`);
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="[^"]+" hidden=""/);
    expect(html).toContain('aria-label="Close navigation"');
  });

  it("renders optional sound disabled, without starting audio during server rendering", () => {
    const html = renderToStaticMarkup(<MarketingHeader audience="players" />);
    expect(html).toContain('aria-label="Interface sound" aria-pressed="false"');
    expect(html).toContain("Sound off");
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("autoplay");
  });

  it("uses the approved P badge for both header and menu branding", () => {
    const html = renderToStaticMarkup(<MarketingHeader audience="players" />);
    expect(html.match(/class="pt-marketing-mark" src="\/brand\/posetek-p.svg"/g)).toHaveLength(2);
  });

  it.each(["players", "coaches"] as const)("keeps each animated %s menu label one coherent accessible name", audience => {
    const html = renderToStaticMarkup(<MarketingHeader audience={audience} />);
    const pages = html.match(/<nav class="pt-menu-pages"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || "";
    const links = Array.from(pages.matchAll(/<a href="[^"]+" aria-label="([^"]+)">([\s\S]*?)<\/a>/g));
    expect(links.map(link => link[1])).toEqual(["Players", "Coaches", audience === "players" ? "Book a test" : "Get in touch"]);
    for (const [, label, content] of links) {
      const visual = content.match(/<strong aria-hidden="true">([\s\S]*?)<\/strong>/)?.[1];
      expect(visual?.replace(/<[^>]+>/g, "")).toBe(label);
    }
  });
});

describe("optional public interface sound", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  function audioEnvironment(saved: string | null = null) {
    const events = new Map<string, () => void>();
    const oscillator = { frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), type: "sine", onended: null };
    const gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
    const audio = { state: "running", currentTime: 0, destination: {}, createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain), suspend: vi.fn(() => Promise.resolve()), resume: vi.fn(() => Promise.resolve()) };
    const AudioContext = vi.fn(function() { return audio; });
    const sessionStorage = { getItem: vi.fn(() => saved), setItem: vi.fn() };
    const document = { hidden: false, addEventListener: vi.fn((event: string, callback: () => void) => events.set(event, callback)) };
    vi.stubGlobal("window", { AudioContext, sessionStorage });
    vi.stubGlobal("document", document);
    return { AudioContext, audio, oscillator, gain, sessionStorage, document, events };
  }

  it("does not allocate audio until an enabled interaction, including with a remembered preference", async () => {
    const environment = audioEnvironment("on");
    const sound = await import("./marketing-sound");
    expect(sound.initializeMarketingSound()).toBe(true);
    expect(environment.AudioContext).not.toHaveBeenCalled();
    sound.playMarketingSound("open");
    expect(environment.AudioContext).toHaveBeenCalledTimes(1);
    expect(environment.oscillator.start).toHaveBeenCalledTimes(1);
    expect(environment.oscillator.stop).toHaveBeenCalledWith(.085);
  });

  it("stays silent by default and persists an explicit opt-in only for the session", async () => {
    const environment = audioEnvironment();
    const sound = await import("./marketing-sound");
    expect(sound.initializeMarketingSound()).toBe(false);
    sound.playMarketingSound();
    expect(environment.AudioContext).not.toHaveBeenCalled();
    sound.setMarketingSoundEnabled(true);
    expect(environment.sessionStorage.setItem).toHaveBeenCalledWith("posetek.marketing.sound", "on");
    expect(environment.AudioContext).not.toHaveBeenCalled();
    sound.playMarketingSound("action");
    expect(environment.oscillator.start).toHaveBeenCalledTimes(1);
    sound.setMarketingSoundEnabled(false);
    sound.playMarketingSound("close");
    expect(environment.audio.suspend).toHaveBeenCalledTimes(1);
    expect(environment.oscillator.start).toHaveBeenCalledTimes(1);
  });

  it("suspends on hidden tabs and never starts a hidden cue", async () => {
    const environment = audioEnvironment("on");
    const sound = await import("./marketing-sound");
    sound.initializeMarketingSound();
    sound.playMarketingSound();
    environment.document.hidden = true;
    environment.events.get("visibilitychange")?.();
    sound.playMarketingSound();
    expect(environment.audio.suspend).toHaveBeenCalledTimes(1);
    expect(environment.oscillator.start).toHaveBeenCalledTimes(1);
  });

  it("does not interrupt navigation when storage or audio support is unavailable", async () => {
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("storage blocked"); } });
    vi.stubGlobal("document", { hidden: false });
    const sound = await import("./marketing-sound");
    expect(sound.initializeMarketingSound()).toBe(false);
    expect(() => sound.setMarketingSoundEnabled(true)).not.toThrow();
    expect(() => sound.playMarketingSound()).not.toThrow();
  });
});
