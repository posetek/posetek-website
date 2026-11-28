export type MarketingAudience = "players" | "coaches";
export const TEAM_ENQUIRY_HREF = "mailto:dylank@posetek.net?subject=PoseTek%20team%20enquiry";
export const marketingSections = {
  players: [["Tests", "#tests"], ["Development pathway", "#profile"], ["Training", "#training"], ["AI Coach", "#ai-coach"], ["Mobile app", "#mobile-app"]],
  coaches: [["Team report", "#club"], ["Player focus", "#players"], ["Follow-up", "#development"], ["Get in touch", "#contact"]],
} as const;
