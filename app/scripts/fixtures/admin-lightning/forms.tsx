// Browser-only synthetic component fixture. Imported by the acceptance driver,
// never by a production entry point. Every transport is replaced by the driver.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AdminWorkspace from '/src/pages/admin/views/AdminWorkspace';
import JumpTechniqueEditor from '/src/pages/admin/views/JumpTechniqueEditor';
import AdminDoseDialog from '/src/pages/admin/views/AdminDoseDialog';
import RationaleDialog from '/src/pages/admin/views/RationaleDialog';
import DrillForm from '/src/pages/admin/views/DrillForm';
import PersonalizedPrograms from '/src/pages/admin/views/PersonalizedPrograms';
import { normalizeCatalogDrill } from '/src/lib/contracts/drillV2';
import '/src/styles/base.css';
import '/src/styles/pose-portal.css';
import '/src/pages/admin/admin.scss';
import '/src/pages/admin/admin-surfaces.scss';
import '/src/styles/admin-theme.scss';
import '/src/pages/admin/admin-dashboard.scss';
import '/src/pages/admin/admin-lightning-surfaces.scss';

const source = {
  'key_frames.json': [10, 220, 320, 360],
  'filtered_average_2d_positions.json': Array.from({ length: 400 }, () => [[0, 1], [0, .8], [.1, .6], [.1, .3], [.25, .4], [.4, .4]]),
  'velocity.json': Array.from({ length: 321 }, () => [0, 0]),
  'chest_offsets.json': Array.from({ length: 400 }, () => [0, -.2]),
};
const block = {
  blockId: 'b1', order: 1, kind: 'main', drillId: 'DRB-006', name: 'Synthetic figure-8 drill', domain: 'dribbling',
  sets: 3, reps: 8, repUnit: 'reps', perSide: false, restSeconds: 45, restScope: 'sets',
  restBetweenSetsSeconds: null, familiarizationReps: 0, estimatedMinutes: 0, whyIncluded: 'Keep the ball close.',
};
const drill = normalizeCatalogDrill('DRB-006', {
  schemaVersion: 2, ...block, minAge: 8, maxAge: 19, difficultyLevel: 2, equipment: ['ball', 'cones'],
  requiresPartner: false, positionSpecific: null, howTo: { setup: '', steps: ['Weave.'] },
  dose: { setsMin: 2, setsMax: 4, repsMin: 6, repsMax: 10, repUnit: 'reps', restSecondsMin: 30, restSecondsMax: 60 },
  maxFrequencyPerWeek: 2, coachComments: [], adaptiveLevers: [], status: 'draft', catalogVersion: 'fixture',
});

function Reviews() {
  const [doseOpen, setDoseOpen] = useState(false);
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [dose, setDose] = useState(block);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [jumpRevision,setJumpRevision]=useState('');
  const [rationaleSaved,setRationaleSaved]=useState(false);
  return <>
    <section className="admin-heading"><div><p className="eyebrow">Synthetic fixture</p><h1>Review form acceptance</h1><p>Invented evidence only; actions cannot reach a service.</p></div></section>
    <section className="admin-card"><h2>Workout review controls</h2><p data-testid="dose-summary">{dose.sets} sets</p>
      <div className="admin-form-actions"><button id="dose-opener" className="quiet-button" onClick={event => { event.currentTarget.focus(); setDoseOpen(true); }}>Edit synthetic dose</button>
        <button id="rationale-opener" className="primary-cta" onClick={event => { event.currentTarget.focus(); setRationaleOpen(true); }}>Review synthetic workout</button></div>
    </section>
    {doseOpen && <AdminDoseDialog block={dose} drill={drill} onCancel={() => setDoseOpen(false)} onSave={patch => { window.fixtureWrites.push({ type: 'dose', patch }); setDose(current => ({ ...current, ...patch })); setDoseOpen(false); }} />}
    {rationaleOpen && <RationaleDialog playerName="Synthetic player" workoutTitle="Synthetic workout" diff={{ added: [], removed: [], doseChanged: [], reordered: false, domainMinutesDelta: {} }} warnings={[]} minutesBefore={30} minutesAfter={32} inProgress isNext saving={saving} error={error} onCancel={() => setRationaleOpen(false)} onSave={(rationale, noFeedback) => {
      setSaving(true); setError(null); window.fixtureWrites.push({ type: 'rationale', rationale, noFeedback });
      window.fixtureFinishSave = outcome => { setSaving(false); if(outcome==='success'){setRationaleOpen(false);setRationaleSaved(true)}else setError('Synthetic revision conflict. Review before retrying.'); };
    }} />}
    {rationaleSaved&&<p role="status">Synthetic workout callback completed.</p>}
    {jumpRevision?<p role="status">Synthetic technique callback completed: {jumpRevision}</p>:<JumpTechniqueEditor playerId="fixture-player" repId="fixture-jump" athleteName="Synthetic player" source={source} originalHeight={.123456789} originalAngles={{}} revisionId={null} currentFrame={200} lastFrame={399} seekTo={frame => { window.fixtureFrame = frame; }} onSaved={revision => { window.fixtureRevision = revision; setJumpRevision(revision); }} />}
  </>;
}

export function mountFormsFixture() {
  const root = document.createElement('div'); document.body.append(root);
  createRoot(root).render(<BrowserRouter><AdminWorkspace ready uid="synthetic-fixture-admin" email="admin@example.test" preview onSignOut={() => {}}><Routes>
    <Route path="/admin/drills/new" element={<DrillForm mode="create" />} />
    <Route path="/admin/drills/:drillId/edit" element={<DrillForm mode="edit" />} />
    <Route path="/admin/drills" element={<section><h1>Synthetic drill library destination</h1></section>} />
    <Route path="/admin/programs" element={<PersonalizedPrograms />} />
    <Route path="*" element={<Reviews />} />
  </Routes></AdminWorkspace></BrowserRouter>);
}
