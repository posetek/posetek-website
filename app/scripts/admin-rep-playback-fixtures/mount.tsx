import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import RepTools from '/src/pages/admin/views/RepTools';
import '/src/styles/base.css';
import '/src/styles/pose-portal.css';
import '/src/pages/admin/admin.scss';
import '/src/pages/admin/admin-surfaces.scss';
import '/src/styles/admin-theme.scss';
import '/src/pages/admin/admin-dashboard.scss';
import '/src/pages/admin/admin-lightning-surfaces.scss';

function Preview() {
  return <BrowserRouter><main className="pt-pose pt-admin admin-page admin-dashboard" style={{ padding: 24 }}>
    <nav aria-label="Synthetic playback cases" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
      {['tracking', 'metadata', 'pose', 'video', 'tracking-error', 'sprint-geometry', 'unknown-timing'].map(id =>
        <Link key={id} to={`/admin/accounts/player/synthetic-athlete/results/${id === 'sprint-geometry' ? 'sprint' : 'dribbling'}/${id}`}>{id}</Link>)}
    </nav>
    <Routes><Route path="/admin/accounts/player/:playerId/results/:drillKey/:repId" element={<RepTools />} /></Routes>
  </main></BrowserRouter>;
}
const root = document.createElement('div'); document.body.append(root);
createRoot(root).render(<Preview />);
