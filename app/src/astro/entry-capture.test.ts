import { afterEach, describe, expect, it, vi } from "vitest";

// The application entries capture every invitation code into memory before the lazy sign-in chunk
// loads, so no code waits in the address bar (Parent accounts review finding 8).
vi.mock("../App", () => ({ default: () => null }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: () => {} }) }));
const CODE = "PAR-" + "0123456789ABCDEF".repeat(2);

function browserAt(href: string) {
  const replaceState = vi.fn();
  const location = { href };
  const window = { location, history: { state: null, replaceState } };
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", { getElementById: () => ({}) });
  return replaceState;
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("application entry capture", () => {
  it.each(["./ApplicationRoot", "../main"])("%s removes a parent code before any page chunk runs", async entry => {
    const replaceState = browserAt(`https://posetek.net/kickai.html#parentCode=${CODE}`);
    await import(entry);
    const { initialParentInvitationLink, forgetParentInvitationLink } = await import("../pages/landing/parent-invitation-link");
    expect(initialParentInvitationLink()).toEqual({ present: true, code: CODE });
    expect(replaceState).toHaveBeenCalledWith(null, "", "https://posetek.net/kickai.html");
    forgetParentInvitationLink();
  });
});
