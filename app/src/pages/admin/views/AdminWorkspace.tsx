import type { ReactNode } from "react";
import AdminHeader from "./AdminHeader";
import "../admin-workspace.scss";

export default function AdminWorkspace({ ready, uid = "", email, preview = false, onSignOut, insights = false, children }: {
  ready: boolean; uid?: string; email?: string; preview?: boolean; onSignOut(): void; insights?: boolean; children: ReactNode;
}) {
  return <div className={`pt-pose portal-body pt-admin pt-admin--lightning admin-workspace${ready ? " admin-ready" : ""}${insights ? " pt-insights" : ""}`}>
    <a className="admin-workspace__skip" href="#admin-main">Skip to workspace</a>
    <AdminHeader key={uid} ready={ready} uid={uid} email={email} preview={preview} onSignOut={onSignOut} />
    <main id="admin-main" tabIndex={-1} className={`admin-workspace__content ${insights ? "insights-shell" : "admin-shell"}`}>{children}</main>
  </div>;
}
