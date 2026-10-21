export type MarketingAudience = "players" | "coaches";
export const TEAM_ENQUIRY_HREF = "mailto:dylank@posetek.net?subject=PoseTek%20team%20enquiry";
export const marketingSections = {
  players: [["Tests", "#tests"], ["Athlete profile", "#profile"], ["Training", "#training"], ["AI Coach", "#ai-coach"], ["Technique", "#technique"], ["Mobile app", "#mobile-app"]],
  coaches: [["Your club", "#club"], ["Every player", "#players"], ["Development", "#development"], ["Get in touch", "#contact"]],
} as const;
