import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TECHNIQUE_PREVIEW_DETAIL, TECHNIQUE_PREVIEW_LIST } from "./ballStrikingPreview";

const fake = vi.hoisted(() => {
  const getIdToken = vi.fn(), getToken = vi.fn(), activate = vi.fn();
  const appCheck = Object.assign(vi.fn(() => ({ getToken, activate })), { ReCaptchaV3Provider: class { siteKey: string; constructor(siteKey: string) { this.siteKey = siteKey; } } });
  const account = { uid: "admin-a", isAnonymous: false, getIdToken };
  return { getIdToken, getToken, activate, appCheck, account, auth: { currentUser: account as typeof account | null }, fetch: vi.fn() };
});
vi.mock("../../../lib/firebase", () => ({ default: { appCheck: fake.appCheck }, auth: fake.auth }));
vi.mock("firebase/compat/app-check", () => ({}));
const origin = "https://agent-gateway-keycy7dkua-uw.a.run.app";
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const identity = TECHNIQUE_PREVIEW_DETAIL.session;

describe("protected direct gateway session reads", () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); fake.auth.currentUser = fake.account;
    fake.getIdToken.mockResolvedValue("firebase-token"); fake.getToken.mockResolvedValue({ token: "app-check-token" });
    fake.fetch.mockResolvedValue(reply(TECHNIQUE_PREVIEW_LIST)); vi.stubGlobal("fetch", fake.fetch);
    vi.stubEnv("VITE_TECHNIQUE_GATEWAY_URL", origin); vi.stubEnv("VITE_TECHNIQUE_APPCHECK_SITE_KEY", "configured-public-site-key");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("uses both verified tokens, trace headers and bounded opaque pagination; initializes the real provider lazily", async () => {
    const api = await import("./ballStrikingData");
    expect(fake.activate).not.toHaveBeenCalled();
    await api.loadTechniqueSessions({ cursor: "opaque+/=cursor" });
    const [url, options] = fake.fetch.mock.calls[0];
    expect(url).toBe(origin + "/v1/technique/admin");
    expect(options).toMatchObject({ method: "POST", credentials: "omit", cache: "no-store", redirect: "error", headers: { Authorization: "Bearer firebase-token", "X-Firebase-AppCheck": "app-check-token", "X-PoseTek-Client": "web/ball-striking-1" } });
    expect(options.headers["X-PoseTek-Request-Id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(options.body)).toEqual({ schemaVersion: 1, action: "list_sessions", limit: 25, cursor: "opaque+/=cursor", playerId: null });
    expect(fake.activate).toHaveBeenCalledWith(expect.objectContaining({ siteKey: "configured-public-site-key" }), true);
    fake.fetch.mockResolvedValue(reply(TECHNIQUE_PREVIEW_DETAIL));
    expect((await api.loadTechniqueSession(identity.playerId, identity.sessionId, { cursor: "turn-page" })).session.playerId).toBe(identity.playerId);
    expect(JSON.parse(fake.fetch.mock.calls[1][1].body)).toMatchObject({ action: "get_session", playerId: identity.playerId, sessionId: identity.sessionId, cursor: "turn-page" });
    expect(fake.activate).toHaveBeenCalledTimes(1);
  });
  it("fails closed before tokens/network when legitimate configuration is missing or points elsewhere", async () => {
    const api = await import("./ballStrikingData");
    for (const url of ["", "http://agent-gateway-keycy7dkua-uw.a.run.app", "https://other.example", origin + "/elsewhere", origin + "?token=bad", "https://user:password@agent-gateway-keycy7dkua-uw.a.run.app"]) {
      expect(() => api.techniqueAdminConfig(url, "site-key")).toThrow(/configured/);
    }
    vi.stubEnv("VITE_TECHNIQUE_APPCHECK_SITE_KEY", "");
    await expect(api.loadTechniqueSessions()).rejects.toThrow(/configured/);
    expect(fake.fetch).not.toHaveBeenCalled(); expect(fake.getIdToken).not.toHaveBeenCalled();
  });
  it("never sends a request without AppCheck or from an anonymous/signed-out account", async () => {
    const api = await import("./ballStrikingData");
    fake.auth.currentUser = null;
    await expect(api.loadTechniqueSessions()).rejects.toThrow(/Sign in/);
    fake.auth.currentUser = { ...fake.account, isAnonymous: true };
    await expect(api.loadTechniqueSessions()).rejects.toThrow(/Sign in/);
    fake.auth.currentUser = fake.account; fake.getToken.mockRejectedValue(new Error("private SDK detail"));
    await expect(api.loadTechniqueSessions()).rejects.toThrow(/App verification/);
    expect(fake.fetch).not.toHaveBeenCalled();
  });
  it("discards account changes while obtaining tokens and while the response is in flight", async () => {
    const api = await import("./ballStrikingData");
    fake.getIdToken.mockImplementation(async () => { fake.auth.currentUser = { ...fake.account, uid: "admin-b" }; return "old-account-token"; });
    await expect(api.loadTechniqueSessions()).rejects.toThrow(/account changed/);
    expect(fake.fetch).not.toHaveBeenCalled();
    fake.auth.currentUser = fake.account; fake.getIdToken.mockResolvedValue("token");
    fake.fetch.mockImplementation(async () => { fake.auth.currentUser = null; return reply(TECHNIQUE_PREVIEW_LIST); });
    await expect(api.loadTechniqueSessions()).rejects.toThrow(/account changed/);
  });
  it("does not start requests for invalid links or already-cancelled reads", async () => {
    const api = await import("./ballStrikingData");
    await expect(api.loadTechniqueSession("../other", identity.sessionId)).rejects.toThrow(/address/);
    const controller = new AbortController(); controller.abort();
    await expect(api.loadTechniqueSessions({ signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.fetch).not.toHaveBeenCalled();
  });
  it("times out stalled token acquisition and never sends a later request", async () => {
    const api = await import("./ballStrikingData");
    vi.useFakeTimers();
    try {
      fake.getIdToken.mockReturnValue(new Promise(() => {}));
      const pending = expect(api.loadTechniqueSessions()).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(30000); await pending;
      expect(fake.fetch).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("uses safe actionable errors without echoing provider payloads or arbitrary exceptions", async () => {
    const api = await import("./ballStrikingData");
    fake.fetch.mockResolvedValue(reply({ code: "permission_denied", message: "private provider response" }, 403));
    const error = await api.loadTechniqueSessions().catch(error => error);
    expect(api.techniqueReadError(error)).toContain("administrator access");
    expect(api.techniqueReadError(error)).not.toContain("private");
    expect(api.techniqueReadError(new Error("secret debug dump"))).not.toContain("secret");
    fake.fetch.mockResolvedValue(reply({ code: "app_check_failed", message: "secret" }, 401));
    await expect(api.loadTechniqueSessions()).rejects.toThrow(/verification was rejected/);
  });
  it("rejects a mismatched server session and oversized responses", async () => {
    const api = await import("./ballStrikingData");
    fake.fetch.mockResolvedValue(reply({ ...TECHNIQUE_PREVIEW_DETAIL, session: { ...identity, playerId: "other-player" } }));
    await expect(api.loadTechniqueSession(identity.playerId, identity.sessionId)).rejects.toThrow(/verified/);
    fake.fetch.mockResolvedValue(new Response(" ".repeat(16 * 1024 * 1024 + 1)));
    await expect(api.loadTechniqueSessions()).rejects.toThrow(/too much data/);
  });
});
