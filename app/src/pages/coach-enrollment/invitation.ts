export const COACH_CODE = /^COACH-[A-F0-9]{32}-[A-F0-9]{64}$/;
export function readCoachInvitation(href: string) {
  const url = new URL(href), fragment = new URLSearchParams(url.hash.slice(1));
  const codes = fragment.getAll("coachInvite");
  const allowed = ["/coach-join", "/coach-join/", "/coach-join.html"].includes(url.pathname);
  fragment.delete("coachInvite"); url.searchParams.delete("coachInvite"); url.hash = fragment.toString();
  return { code: allowed && codes.length === 1 && COACH_CODE.test(codes[0]) ? codes[0] : "", cleanUrl: url.href };
}
export function coachEnrollmentDestination(result: { organizationId: string; teamIds: string[] }) {
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(result.organizationId) || !Array.isArray(result.teamIds)
    || !result.teamIds.length || result.teamIds.some(id => !/^[A-Za-z0-9_-]{1,150}$/.test(id))) throw new Error("Your team access could not be confirmed. Sign in normally or contact PoseTek.");
  const query = new URLSearchParams({ orgId: result.organizationId });
  if (result.teamIds.length === 1) query.set("teamId", result.teamIds[0]);
  return `/insights?${query}`;
}
export interface CoachInvitation {
  status: "ready" | "claimed";
  label?: string;
  organizationName?: string;
  teamNames?: string[];
  expiresAtMillis?: number;
}
