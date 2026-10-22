// Browser-only synthetic coverage for native modality and rerender stability.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdminModal from '/src/pages/admin/views/AdminModal';
import '/src/styles/base.css';
import '/src/styles/pose-portal.css';
import '/src/pages/admin/admin.scss';
import '/src/pages/admin/admin-surfaces.scss';
import '/src/styles/admin-theme.scss';
import '/src/pages/admin/admin-lightning-surfaces.scss';

function Fixture() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  return <main className="admin-workspace__content">
    <button id="modal-opener" onClick={event => { event.currentTarget.focus(); setOpen(true); }}>Open review</button>
    {open && <AdminModal label="Synthetic review" onClose={() => { window.modalEvents.push('closed'); setOpen(false); }} dismissDisabled={busy}>
      <h2>Review synthetic changes</h2>
      <input aria-label="Review note" defaultValue="untouched" />
      <button onClick={() => setCount(value => value + 1)}>Rerender {count}</button>
      <button onClick={() => setBusy(value => !value)}>{busy ? 'Finish saving' : 'Simulate saving'}</button>
      <button onClick={() => setOpen(false)}>Keep editing</button>
    </AdminModal>}
  </main>;
}

export function mountFixture() {
  document.getElementById('root')?.setAttribute('style', 'display:none');
  const fixture = document.createElement('div');
  fixture.className = 'pt-pose portal-body pt-admin admin-workspace';
  document.body.append(fixture);
  window.modalEvents = [];
  createRoot(fixture).render(<Fixture />);
}
