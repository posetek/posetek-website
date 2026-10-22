import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import Icon from "./AdminWorkspaceIcon";
import AdminHeader from "./AdminHeader";
import { useAdminToolLinks } from "../lib/useAdminNavigation";
import "../admin-workspace.scss";

export default function AdminWorkspace({ ready, uid = "", email, preview = false, onSignOut, insights = false, children }: {
  ready: boolean; uid?: string; email?: string; preview?: boolean; onSignOut(): void; insights?: boolean; children: ReactNode;
}) {
  const location = useLocation();
  const view = new URLSearchParams(location.search).get("view") || "overview";
  return <div className={`pt-pose portal-body pt-admin pt-admin--lightning admin-workspace${ready ? " admin-ready" : ""}${insights ? " pt-insights" : ""}`}>
    <a className="admin-workspace__skip" href="#admin-main">Skip to workspace</a>
    <AdminHeader key={uid} ready={ready} uid={uid} email={email} preview={preview} onSignOut={onSignOut} />
    <main id="admin-main" tabIndex={-1} className={`admin-workspace__content ${insights ? "insights-shell" : "admin-shell"}`}>{ready && insights && view === "overview" && <AdminOverviewLaunchpad uid={uid} />}{children}</main>
  </div>;
}

function AdminOverviewLaunchpad({ uid }: { uid: string }) {
  const toolPath = useAdminToolLinks(uid);
  const shortcuts = [
    { path: "/admin/accounts", icon: "groups", title: "People & teams", description: "Open a roster or player record." },
    { path: "/admin/programs", icon: "calendar_month", title: "Training plans", description: "Continue planning for your players." },
    { path: "/admin/analysis", icon: "view_in_ar", title: "Technique review", description: "Review recorded movement evidence." },
    { path: "/admin/access", icon: "key", title: "Account access", description: "Manage activation and recovery." },
  ];
  return <section className="admin-workspace__launchpad" aria-labelledby="admin-overview-heading"><div className="admin-workspace__welcome"><div><p>YOUR WORKSPACE</p><h1 id="admin-overview-heading">A clear view of your club.</h1><span>People, training and the evidence behind their progress.</span></div><img className="admin-workspace__welcome-mark" src="/brand/posetek-p.svg" alt="" width="76" height="76" /></div><nav aria-label="Overview shortcuts">{shortcuts.map(item => <Link key={item.path} to={toolPath(item.path)}><Icon name={item.icon} /><span><strong>{item.title}</strong><small>{item.description}</small></span><Icon name="arrow_forward" /></Link>)}</nav></section>;
}
