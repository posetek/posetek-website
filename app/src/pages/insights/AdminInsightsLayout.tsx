import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon from "../admin/views/AdminWorkspaceIcon";
import { useAdminToolLinks } from "../admin/lib/useAdminNavigation";
import AdminWorkspace from "../admin/views/AdminWorkspace";
import "../admin/admin.scss";
import "../admin/admin-surfaces.scss";
import "../../styles/admin-theme.scss";
import "../admin/admin-dashboard.scss";
import "../admin/admin-lightning-surfaces.scss";

/** Render only after the Insights service has established the admin role. */
export default function AdminInsightsLayout({ uid, email, preview = false, onSignOut, children }: {
  uid: string; email?: string; preview?: boolean; onSignOut: () => void; children: ReactNode;
}) {
  return <AdminWorkspace ready uid={uid} email={email} preview={preview} onSignOut={onSignOut} insights>{children}</AdminWorkspace>;
}

const shortcuts = [
  { path: "/admin/accounts", icon: "groups", label: "People & teams" },
  { path: "/admin/programs", icon: "calendar_month", label: "Training plans" },
  { path: "/admin/analysis", icon: "view_in_ar", label: "Technique review" },
  { path: "/admin/access", icon: "key", label: "Account access" },
];

export function AdminReportHeading({ uid, scope, overview }: { uid: string; scope?: string; overview: boolean }) {
  const toolPath = useAdminToolLinks(uid);
  return (
    <header className="admin-overview-heading">
      <div>
        <h1>{overview ? "Club overview" : "Club reporting"}</h1>
        {scope && <p>{scope}</p>}
      </div>
      {overview && (
        <nav className="admin-report-shortcuts" aria-label="Overview shortcuts">
          {shortcuts.map(({ path, icon, label }) => (
            <Link key={path} to={toolPath(path)}><Icon name={icon} />{label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}
