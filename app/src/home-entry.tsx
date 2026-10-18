import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MarketingHeader } from "./pages/home/MarketingHeader";
import HomePage from "./pages/home/HomePage";

createRoot(document.getElementById("root")!).render(
  <StrictMode><div className="pt-home pt-revamp pt-marketing-shell"><MarketingHeader audience="players" legacy /><HomePage /></div></StrictMode>,
);
