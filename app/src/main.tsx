import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/base.css";
import App from "./App";
import { capturePlayerInvitationLink } from "./pages/landing/player-invitation-link";
import { captureParentInvitationLink } from "./pages/landing/parent-invitation-link";
import { captureStaffAccessLink } from "./lib/account-access";

captureStaffAccessLink(window);
capturePlayerInvitationLink(window);
captureParentInvitationLink(window);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
