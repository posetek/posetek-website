import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubContext } from "../../../lib/organization-data";
import type { AccountLoad } from "../lib/useAccountLoad";
import type { ParentReply } from "../../coach-reminders/reminders";

const mocks = vi.hoisted(() => ({
  load: vi.fn<(loader: () => Promise<unknown>) => { state: AccountLoad<unknown>; refresh: () => void }>(),
  clubCall: vi.fn(),
  getClubContext: vi.fn(),
}));
vi.mock("../../../lib/firebase", () => ({ auth: { currentUser: { uid: "test-admin" } } }));
vi.mock("../../../lib/organization-data", () => ({ clubCall: mocks.clubCall, getClubContext: mocks.getClubContext }));
vi.mock("../lib/useAccountLoad", () => ({ useAccountLoad: mocks.load }));

import AdminMessaging from "./AdminMessaging";
import { ReplyInbox } from "../../coach-reminders/ReminderAdmin";
import { vacavilleId } from "../../coach-reminders/reminders";

const org = { id: vacavilleId, name: "Vacaville United", schemaVersion: 2 };
const context: ClubContext = {
  role: "admin", organizations: [org], organization: org, invitations: [], players: [],
  teams: [{ id: "blue", name: "Blue team", organizationId: org.id, coachUIDs: ["casey"], playerIds: [] }],
  staff: [{ userUID: "casey", firstName: "Casey", lastName: "Coach", email: "", role: "coach", status: "active", teamIds: ["blue"] }],
};
const pending: ParentReply = { id: "pending", body: "Pending household question", receivedAt: 1, teamIds: ["blue"] };
const forwarded: ParentReply = { id: "forwarded", body: "Forwarded household question", receivedAt: 2, forwardedCoachUid: "casey", forwardedTeamId: "blue" };
const ready = (data: unknown) => ({ state: { kind: "ready" as const, data }, refresh: vi.fn() });
const renderPage = (query = "", preview = false) => renderToStaticMarkup(
  <MemoryRouter initialEntries={["/admin/messaging" + query]}><AdminMessaging preview={preview} /></MemoryRouter>,
);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockReturnValue({ state: { kind: "loading" }, refresh: vi.fn() });
});

describe("Vacaville admin messaging", () => {
  it("links each primary view to Vacaville and marks only the current location", () => {
    const base = "/admin/messaging?orgId=" + vacavilleId;
    for (const [section, label] of [["", "Inbox"], ["forwarded", "Forwarded replies"], ["plan", "Texting plan"]]) {
      const html = renderPage("?orgId=" + vacavilleId + (section ? "&section=" + section : ""), true);
      const links = [...html.matchAll(/<a\b([^>]*)>(Inbox|Forwarded replies|Texting plan)<\/a>/g)];
      expect(links.map(match => match[2])).toEqual(["Inbox", "Forwarded replies", "Texting plan"]);
      expect(links.filter(match => match[1].includes('aria-current="page"')).map(match => match[2])).toEqual([label]);
      expect(links.map(match => match[1].match(/href="([^"]+)"/)?.[1])).toEqual([
        base, base + "&amp;section=forwarded", base + "&amp;section=plan",
      ]);
    }
  });

  it("offers an explicit switch from another club without reading a Vacaville conversation", () => {
    const html = renderPage("?orgId=other-club&section=forwarded");
    expect(html).toContain("Open Vacaville messaging");
    expect(html).toContain('href="/admin/messaging?orgId=' + vacavilleId + '"');
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it.each(["inbox", "forwarded"])("keeps private %s conversations out of the local preview", section => {
    expect(renderPage("?section=" + section, true)).toContain("available after admin sign-in");
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("requires the returned club and an admin or manager role before requesting replies", async () => {
    for (const gate of [{ ...context, role: "coach" }, { ...context, organization: { ...org, id: "other" } }, { ...context, organization: null }]) {
      mocks.load.mockClear().mockReturnValueOnce(ready(gate));
      expect(renderPage()).toContain("need Vacaville messaging access");
      expect(mocks.load).toHaveBeenCalledTimes(1);
      await mocks.load.mock.calls[0][0]();
      expect(mocks.getClubContext).toHaveBeenCalledWith(vacavilleId);
      expect(mocks.clubCall).not.toHaveBeenCalled();
    }
  });

  it.each(["admin", "manager"])("exposes the inbox and permission disclosure to the authorized %s", role => {
    mocks.load.mockReturnValueOnce(ready({ ...context, role }));
    const html = renderPage("?section=unknown");
    expect(html).toContain("Refresh inbox");
    expect(html).toContain("Guardian SMS permissions");
    expect(html).not.toContain("Refresh forwarded replies");
  });

  it("keeps private account errors distinct from an empty inbox", () => {
    mocks.load.mockReturnValueOnce({ state: { kind: "error", message: "Access denied." }, refresh: vi.fn() });
    const html = renderPage();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Access denied.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("No parent replies");
  });
});

async function renderReplies(replies: ParentReply[], forwardedOnly: boolean, nextCursor?: string) {
  const inbox = <ReplyInbox context={context} forwardedOnly={forwardedOnly} />;
  renderToStaticMarkup(inbox);
  mocks.clubCall.mockResolvedValueOnce({ replies, nextCursor });
  const data = await mocks.load.mock.lastCall![0]();
  expect(mocks.clubCall).toHaveBeenCalledWith("listAdminParentReplies", { organizationId: vacavilleId });
  mocks.load.mockReturnValueOnce(ready(data));
  return renderToStaticMarkup(inbox);
}

describe("parent reply history", () => {
  it("shows pending replies with a forwarding action and identifies previously forwarded replies in the inbox", async () => {
    const html = await renderReplies([pending, forwarded], false);
    expect(html).toContain(pending.body);
    expect(html).toContain("Forward to coach");
    expect(html).toContain(forwarded.body);
    expect(html).toContain("Casey Coach");
    expect(html).toContain("Blue team");
  });

  it("filters pending replies out of forwarded history and identifies the recipient without offering another send", async () => {
    const html = await renderReplies([pending, forwarded], true);
    expect(html).not.toContain(pending.body);
    expect(html).not.toContain("Forward to coach");
    expect(html).toContain(forwarded.body);
    expect(html).toContain("Casey Coach");
    expect(html).toContain("Blue team");
  });

  it("preserves Older replies when a page has no forwarded matches", async () => {
    const html = await renderReplies([pending], true, "older-next");
    expect(html).not.toContain(pending.body);
    expect(html).toContain("No forwarded replies on this page.");
    expect(html).toContain(">Older replies</button>");
  });
});

it("shows the published pilot estimate as a monthly base for one number and 360 billed segments", () => {
  const html = renderPage("?section=plan");
  expect(mocks.load).not.toHaveBeenCalled();
  expect(html).toContain("Handset test · 1 sent / 1 received");
  expect(html).toContain("Club pilot · 300 sent / 60 received");
  expect(html).toContain("Larger rollout · 1,000 sent / 200 received");
  const amounts = [...html.matchAll(/<tr><th scope="row"><a href="[^"]+">([^<]+)<\/a><\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><td><strong>([^<]+)<\/strong>/g)];
  expect(amounts.map(row => row.slice(1))).toEqual([
    ["Telnyx", "$1.10", "$0.0055", "$3.08"],
    ["SignalWire", "$0.80", "$0.0068", "$3.25"],
    ["Twilio", "$2.15", "$0.0083", "$5.14"],
  ]);
  expect(html).toContain("exclude carrier fees and taxes");
  expect(html).toContain("Selection pending");
});
