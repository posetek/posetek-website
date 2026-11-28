import type { MouseEvent } from "react";

/** Keep the chapter's native link before hydration. The open panel owns scrolling once interactive. */
export function openDemoFromLink(event: MouseEvent<HTMLAnchorElement>, open: () => void) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const { hash } = event.currentTarget;
  if (window.location.hash !== hash) window.history.pushState(window.history.state, "", hash);
  open();
}

export type MarketingAudience = "players" | "coaches";
export const TEAM_ENQUIRY_HREF = "mailto:dylank@posetek.net?subject=PoseTek%20team%20enquiry";
export const marketingSections = {
  players: [["Tests", "#tests"], ["Development pathway", "#profile"], ["Training", "#training"], ["AI Coach", "#ai-coach"], ["Mobile app", "#mobile-app"]],
  coaches: [["Team report", "#club"], ["Player focus", "#players"], ["Follow-up", "#development"], ["Get in touch", "#contact"]],
} as const;
