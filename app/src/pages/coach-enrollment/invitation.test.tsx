import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CoachInvitationSummary } from "./CoachEnrollmentPage";
import { coachEnrollmentDestination, readCoachInvitation } from "./invitation";
const code = `COACH-${"A".repeat(32)}-${"B".repeat(64)}`;
describe("private coach entry", () => {
  it.each(["/coach-join", "/coach-join/", "/coach-join.html"])("captures and removes a fragment before requests on %s", path => {
    expect(readCoachInvitation(`https://posetek.net${path}#coachInvite=${code}`)).toEqual({ code, cleanUrl: `https://posetek.net${path}` });
  });
  it("rejects other routes, duplicate codes and query-string secrets", () => {
    for (const suffix of [`/signin#coachInvite=${code}`, `/coach-join#coachInvite=${code}&coachInvite=${code}`, `/coach-join?coachInvite=${code}`]) {
      const result = readCoachInvitation("https://posetek.net" + suffix); expect(result.code).toBe(""); expect(result.cleanUrl).not.toContain(code);
    }
  });
  it("opens both assigned teams without inventing a combined team ID", () => {
    expect(coachEnrollmentDestination({ organizationId: "club", teamIds: ["boys", "girls"] })).toBe("/insights?orgId=club");
    expect(coachEnrollmentDestination({ organizationId: "club", teamIds: ["boys"] })).toBe("/insights?orgId=club&teamId=boys");
    expect(() => coachEnrollmentDestination({ organizationId: "//external", teamIds: ["boys"] })).toThrow();
  });
  it("shows the exact coach label and team names with no access editor", () => {
    const html = renderToStaticMarkup(<CoachInvitationSummary invitation={{ status: "ready", label: "Coach Niall", organizationName: "Vacaville", teamNames: ["Boys", "Girls"] }} />);
    expect(html).toContain("Coach Niall"); expect(html).toContain("Boys"); expect(html).toContain("Girls"); expect(html).toContain("these teams only"); expect(html).not.toContain("<input");
  });
});
