import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import AdminWorkspace from '/src/pages/admin/views/AdminWorkspace';
import MonitorAccounts from '/src/pages/admin/views/MonitorAccounts';
// All consumers must resolve through the intercepted Firebase module. A direct
// Vite import can gain a ?t= timestamp and instantiate a second fixture adapter.
import { auth, directorySource } from '/src/lib/firebase';
import '/src/styles/base.css';
import '/src/styles/pose-portal.css';
import '/src/pages/admin/admin.scss';
import '/src/pages/admin/admin-surfaces.scss';
import '/src/styles/admin-theme.scss';
import '/src/pages/admin/admin-dashboard.scss';
import '/src/pages/admin/admin-lightning-surfaces.scss';

function Fixture() {
  const [user, setUser] = useState(auth.currentUser);
  useEffect(() => auth.onAuthStateChanged(setUser), []);
  if (!user) return <main><h1>Synthetic signed-out state</h1><p>No live authentication was used.</p></main>;
  return <BrowserRouter><AdminWorkspace ready uid={user.uid} email={user.email} preview onSignOut={() => window.__adminActivity.setAccount(null)}>
    <Routes><Route path="/admin/accounts" element={<MonitorAccounts source={directorySource} />} />
      <Route path="*" element={<section><h1>Synthetic record destination</h1><p>Destination routing only; this fixture does not certify that separate tool.</p><Link to="/admin/accounts">Back to directory</Link></section>} /></Routes>
  </AdminWorkspace></BrowserRouter>;
}

export function mountActivityFixture() {
  const root = document.createElement('div'); document.body.append(root);
  createRoot(root).render(<Fixture />);
}
