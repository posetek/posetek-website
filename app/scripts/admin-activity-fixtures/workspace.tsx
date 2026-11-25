// Interactive review uses the existing read-only, loopback activity fixture.
// This entry is served by the preview proxy only and is outside the production app.
import '/src/styles/base.css';
import React, { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AdminPage from '/src/pages/admin/AdminPage';
import { legacyAdminWorkspacePath } from '/src/pages/admin/lib/adminNavigation';
import { useAdminScrollRestoration } from '/src/pages/admin/lib/useAdminNavigation';
import AdminWorkspace from '/src/pages/admin/views/AdminWorkspace';
import MonitorAccounts from '/src/pages/admin/views/MonitorAccounts';
import { InsightsWorkspace } from '/src/pages/insights/InsightsPage';
import { auth, directorySource } from '/src/lib/firebase';

function SampleTool() {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  if (query.get('preview') === '1') return <AdminPage />;
  query.set('preview', '1');
  return <Navigate replace state={location.state} to={{ pathname: location.pathname, search: query.toString(), hash: location.hash }} />;
}

function Directory({ uid }) {
  useAdminScrollRestoration(uid);
  return <MonitorAccounts source={directorySource} />;
}

export default function WorkspacePreview() {
  const location = useLocation();
  const [user, setUser] = useState(auth.currentUser);
  useEffect(() => auth.onAuthStateChanged(setUser), []);
  if (!user) return <main><h1>Signed out of the local preview</h1><a href="/admin/accounts">Reopen the workspace</a></main>;
  const shell = children => <AdminWorkspace ready uid={user.uid} email={user.email} preview onSignOut={() => window.__adminActivity.setAccount(null)}>{children}</AdminWorkspace>;
  return <Routes>
    <Route path="/admin" element={<Navigate to={legacyAdminWorkspacePath(location.search)} state={location.state} replace />} />
    <Route path="/admin/accounts" element={shell(<Directory uid={user.uid} />)} />
    <Route path="/insights" element={<InsightsWorkspace uid={user.uid} />} />
    <Route path="/admin/*" element={<SampleTool />} />
    <Route path="*" element={shell(<section className="admin-card"><h1>Outside the admin preview</h1><Link to="/admin/accounts">Back to people &amp; organizations</Link></section>)} />
  </Routes>;
}
