import { StrictMode, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import LandingPage from "../pages/landing/LandingPage";
import { capturePlayerInvitationLink } from "../pages/landing/player-invitation-link";
import "../styles/base.css";
if (typeof window !== "undefined") capturePlayerInvitationLink(window);
function ExistingApplication() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    window.location.replace(path + location.search + location.hash);
  }, [location.pathname, location.search, location.hash]);
  return <p role="status">Opening PoseTek…</p>;
}
export default function PlayerSignInRoot() {
  return <StrictMode><BrowserRouter><Routes><Route path="/signin" element={<LandingPage />} /><Route path="/player-signin.html" element={<LandingPage />} /><Route path="*" element={<ExistingApplication />} /></Routes></BrowserRouter></StrictMode>;
}
