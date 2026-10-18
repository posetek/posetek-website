import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MarketingHeader } from "./pages/home/MarketingHeader";
import CoachesPage from "./pages/coaches/CoachesPage";

createRoot(document.getElementById("root")!).render(<StrictMode><div className="pt-home pt-revamp pt-marketing-shell"><MarketingHeader audience="coaches" legacy /><CoachesPage /></div></StrictMode>);
