import type { ReactNode } from "react";
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
