export const coachReportOrganization = "vacaville-united-soccer-club";

export function coachReportRoute(organizationId: string, teamId?: string) {
  const query = new URLSearchParams({ orgId: organizationId });
  if (teamId) query.set("teamId", teamId);
  return "/coach-report?" + query;
}
