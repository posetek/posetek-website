import { StrictMode } from "react";
import App from "../App";
import { captureStaffAccessLink } from "../lib/account-access";
import { capturePlayerInvitationLink } from "../pages/landing/player-invitation-link";
import { captureParentInvitationLink } from "../pages/landing/parent-invitation-link";
import "../styles/base.css";

// This module is loaded only in the browser by Astro's client:only island.
// Capture into the existing module memory before any React effect/analytics runs,
// so neither code waits in the address bar for the lazy sign-in chunk.
if (typeof window !== "undefined") {
  captureStaffAccessLink(window);
  capturePlayerInvitationLink(window);
  captureParentInvitationLink(window);
}

export default function ApplicationRoot() {
  return <StrictMode><App /></StrictMode>;
}
