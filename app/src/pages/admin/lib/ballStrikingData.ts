import firebase, { auth } from "../../../lib/firebase";
import { normalizeTechniqueSessionDetail, normalizeTechniqueSessionPage, validTechniqueId, validTechniquePlayerId } from "./ballStriking";
import type { TechniqueSessionDetail, TechniqueSessionPage } from "./ballStriking";

export const TECHNIQUE_GATEWAY_ORIGIN = "https://agent-gateway-keycy7dkua-uw.a.run.app";
const CONFIG_ERROR = "Session review is unavailable until the gateway URL and App Check site key are configured.";
export interface TechniqueAdminConfig { gatewayUrl: string; siteKey: string }
export function techniqueAdminConfig(gatewayUrl: unknown, siteKey: unknown): TechniqueAdminConfig {
  if (typeof gatewayUrl !== "string" || typeof siteKey !== "string" || !siteKey.trim()) throw new Error(CONFIG_ERROR);
  try {
    const url = new URL(gatewayUrl);
    if (url.origin !== TECHNIQUE_GATEWAY_ORIGIN || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error();
    return { gatewayUrl: url.origin, siteKey: siteKey.trim() };
  } catch { throw new Error(CONFIG_ERROR); }
}

let appCheckReady: Promise<void> | null = null;
/** Real SDK/provider initialization is lazy: other admin tools do not load reCAPTCHA. */
async function appCheckToken(siteKey: string): Promise<string> {
  if (!appCheckReady) appCheckReady = import("firebase/compat/app-check").then(() => {
    firebase.appCheck().activate(new firebase.appCheck.ReCaptchaV3Provider(siteKey), true);
  }).catch(() => { appCheckReady = null; throw new Error("App verification could not start. Refresh and try again."); });
  await appCheckReady;
  try {
    const result = await firebase.appCheck().getToken(false);
    if (!result.token) throw new Error();
    return result.token;
  } catch { throw new Error("App verification could not finish. Check your connection and refresh to try again."); }
}

export function techniqueReadError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "The session request was cancelled. Refresh to try again.";
  if (error instanceof Error && error.name === "TimeoutError") return "Session review took too long. Try again.";
  return error instanceof TechniqueReadError || error instanceof Error && [CONFIG_ERROR,
    "App verification could not start. Refresh and try again.", "App verification could not finish. Check your connection and refresh to try again.",
    "Sign in again to review coaching sessions.", "Your account changed. Reopen session review.",
    "Session records could not be verified. Refresh to try again.", "The session address is incomplete. Return to coaching sessions and open it again.",
  ].includes(error.message) ? error.message : "Coaching sessions could not be loaded. Check your connection and try again.";
}
class TechniqueReadError extends Error {}
function serverError(code: unknown, status: number): TechniqueReadError {
  if (code === "app_check_failed") return new TechniqueReadError("App verification was rejected. Refresh and try again.");
  if (status === 401) return new TechniqueReadError("Sign in again to review coaching sessions.");
  if (status === 403) return new TechniqueReadError("This account cannot review coaching sessions. Verified PoseTek administrator access is required.");
  if (status === 404) return new TechniqueReadError("This session is no longer available. Return to coaching sessions and refresh.");
  if (status === 429) return new TechniqueReadError("Session review is busy. Wait a moment and try again.");
  if (code === "invalid_request") return new TechniqueReadError("This session page has expired or its address is invalid. Refresh the list and open it again.");
  if (status === 503) return new TechniqueReadError("Session review is not available on the gateway yet. Try again after its release is verified.");
  return new TechniqueReadError("Session review is temporarily unavailable. Try again.");
}

interface ReadOptions { cursor?: string | null; signal?: AbortSignal }
type ReadRequest = { schemaVersion: 1; action: "list_sessions" | "get_session"; limit: number; cursor: string | null; playerId: string | null; sessionId?: string };
async function withCancellation<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let cancel = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try { return await Promise.race([promise, aborted]); }
  finally { signal.removeEventListener("abort", cancel); }
}
async function read(request: ReadRequest, signal?: AbortSignal): Promise<unknown> {
  const config = techniqueAdminConfig(import.meta.env.VITE_TECHNIQUE_GATEWAY_URL, import.meta.env.VITE_TECHNIQUE_APPCHECK_SITE_KEY);
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Sign in again to review coaching sessions.");
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 30000);
  const current = () => {
    controller.signal.throwIfAborted();
    if (auth.currentUser?.uid !== user.uid || auth.currentUser?.isAnonymous) throw new Error("Your account changed. Reopen session review.");
  };
  try {
    current();
    const [token, verification] = await withCancellation(Promise.all([user.getIdToken(), appCheckToken(config.siteKey)]), controller.signal);
    current();
    const response = await fetch(`${config.gatewayUrl}/v1/technique/admin`, {
      method: "POST", signal: controller.signal, credentials: "omit", cache: "no-store", redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "X-Firebase-AppCheck": verification, "Content-Type": "application/json",
        "X-PoseTek-Request-Id": crypto.randomUUID(), "X-PoseTek-Client": "web/ball-striking-1" },
      body: JSON.stringify(request),
    });
    current();
    // Bound the audit page before decoding, including responses without Content-Length.
    const reader = response.body?.getReader();
    if (!reader) throw new TechniqueReadError("Session review returned an empty response. Try again.");
    const decoder = new TextDecoder();
    let payload = "", bytes = 0;
    try {
      while (true) {
        const next = await reader.read(); current();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 16 * 1024 * 1024) throw new TechniqueReadError("Session review returned too much data. Refresh to try again.");
        payload += decoder.decode(next.value, { stream: true });
      }
      payload += decoder.decode();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    let data: unknown;
    try { data = JSON.parse(payload); } catch { throw serverError(null, response.status); }
    current();
    if (!response.ok) throw serverError(data && typeof data === "object" && "code" in data ? data.code : null, response.status);
    return data;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); }
}

export async function loadTechniqueSessions({ cursor = null, signal }: ReadOptions = {}): Promise<TechniqueSessionPage> {
  return normalizeTechniqueSessionPage(await read({ schemaVersion: 1, action: "list_sessions", limit: 25, cursor, playerId: null }, signal));
}
export async function loadTechniqueSession(playerId: string, sessionId: string, { cursor = null, signal }: ReadOptions = {}): Promise<TechniqueSessionDetail> {
  if (!validTechniquePlayerId(playerId) || !validTechniqueId(sessionId)) throw new Error("The session address is incomplete. Return to coaching sessions and open it again.");
  return normalizeTechniqueSessionDetail(await read({ schemaVersion: 1, action: "get_session", limit: 25, cursor, playerId, sessionId }, signal), { playerId, sessionId });
}
