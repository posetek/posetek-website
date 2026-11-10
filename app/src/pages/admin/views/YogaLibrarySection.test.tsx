import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/firebase', () => ({ default: {}, auth: {}, db: {}, storage: {}, cloud: {} }));
vi.mock('../lib/yogaLibrary', () => ({
  updateYogaPoseStatus: async () => { throw new Error('offline write'); },
  loadYogaPose: async () => null, loadYogaLibrary: async () => [], loadYogaLibraryVersion: async () => '1.0.0',
}));
import { MemoryRouter } from 'react-router-dom';
import { normalizeYogaPose } from '../../../lib/contracts/yogaLibrary';
import YogaLibrarySection, { YogaPoseRows } from './YogaLibrarySection';
import DrillLibrary from './DrillLibrary';
import { filterYogaPoses, yogaStatusChange } from '../lib/useYogaLibrary';
import { StatusField } from './StatusField';

const pose = (id: string, name: string, posture: string, status?: string, validation?: Record<string, unknown>) =>
  normalizeYogaPose(id, { schemaVersion: 1, name, status, catalogVersion: '1.0.0', yoga: { posture }, ...(validation ? { validation } : {}) });

const poses = [
  pose('athlete_boat', 'Boat', 'seated', 'archived'),
  pose('mountain', 'Mountain', 'standing', 'published'),
  pose('low_lunge', 'Low lunge', 'kneeling', 'draft'),
  pose('child', "Child's pose", 'kneeling'),
];

const selected = (html: string, name: string) => {
  const row = html.split('data-status=').find(part => part.includes(`<strong>${name}</strong>`)) ?? '';
  return /<option[^>]*value="([^"]*)"[^>]*selected/.exec(row)?.[1];
};

describe('yoga library section', () => {
  it('lists every pose with its posture, id and a status select showing the stored status', () => {
    const html = renderToStaticMarkup(<YogaPoseRows poses={poses} busy={null} onStatus={() => {}} />);
    for (const name of ['Boat', 'Mountain', 'Low lunge', 'Child&#x27;s pose']) expect(html).toContain(`<strong>${name}</strong>`);
    expect(html).toContain('athlete_boat');
    expect(html).toContain('>Seated<');
    // Each select is named for its pose, so 128 controls are distinguishable.
    expect(html).not.toContain('aria-label="Status"');
    for (const name of ['Boat', 'Mountain', 'Low lunge', 'Child&#x27;s pose']) expect(html).toContain(`aria-label="${name} status"`);
    expect(html).toContain('data-status="archived"');
    expect(html).toContain('data-status="none"');
    expect(selected(html, 'Mountain')).toBe('published');
    expect(selected(html, 'Boat')).toBe('archived');
  });

  it('after a failed write, keeps the row on its stored status and shows the error inside that row', async () => {
    const failed = await yogaStatusChange({ kind: 'ready', poses, version: '1.0.0' }, poses[1], 'archived');
    const html = renderToStaticMarkup(<YogaPoseRows poses={failed.load.poses} busy={null} message={failed.message} onStatus={() => {}} />);
    expect(selected(html, 'Mountain')).toBe('published');
    const mountainRow = html.split('data-status=').find(part => part.includes('<strong>Mountain</strong>')) ?? '';
    expect(mountainRow).toContain('<p class="form-message" role="alert">offline write</p>');
    expect(html.match(/form-message/g)).toHaveLength(1);
  });

  it('shows a saved-but-not-refreshed notice as status, not as an error', () => {
    const html = renderToStaticMarkup(<YogaPoseRows poses={poses} busy={null}
      message={{ drillId: 'athlete_boat', kind: 'notice', text: 'Saved. Reload before changing it again.' }} onStatus={() => {}} />);
    expect(html).toContain('<p class="form-message" role="status">Saved. Reload before changing it again.</p>');
    expect(html).not.toContain('role="alert"');
  });

  it('renders the library tabs with the shared keyboard tab model and their panels (preview data)', () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/admin/drills?section=yoga&preview=1']}><DrillLibrary preview /></MemoryRouter>);
    expect(html).toContain('role="tablist" aria-label="Library sections"');
    expect(html).toContain('id="library-tab-yoga" role="tab" aria-selected="true" aria-controls="library-panel-yoga" tabindex="0"');
    expect(html).toContain('id="library-tab-drills" role="tab" aria-selected="false" aria-controls="library-panel-drills" tabindex="-1"');
    expect(html).toContain('id="library-panel-yoga" role="tabpanel" aria-labelledby="library-tab-yoga"');
    expect(html).toMatch(/id="library-panel-drills" role="tabpanel" aria-labelledby="library-tab-drills" hidden/);
    expect(html).toContain('aria-label="Mountain status"');
    expect(html).toContain('5 poses');
  });

  it('shows a pose with no status as unset, never as published', () => {
    const html = renderToStaticMarkup(<YogaPoseRows poses={[poses[3]]} busy={null} onStatus={() => {}} />);
    expect(selected(html, 'Child&#x27;s pose')).toBe('');
    expect(html).toContain('<option value="" disabled="" selected="">—</option>');
  });

  it('disables every status select while a write is in flight', () => {
    const html = renderToStaticMarkup(<YogaPoseRows poses={poses} busy="mountain" onStatus={() => {}} />);
    expect(html.match(/<select[^>]*disabled/g)).toHaveLength(4);
  });

  it('applies the validation publish gate to a pose that requires validation', () => {
    const gated = pose('gated', 'Gated', 'seated', 'draft', { required: true, result: 'pending' });
    const html = renderToStaticMarkup(<YogaPoseRows poses={[gated]} busy={null} onStatus={() => {}} />);
    expect(/<option[^>]*value="published"[^>]*>/.exec(html)?.[0]).toContain('disabled');
  });

  it('filters by search, posture and status (including no status), sorted by posture then name', () => {
    const all = { search: '', posture: 'all', status: 'all' };
    expect(filterYogaPoses(poses, all).map(entry => entry.drillId)).toEqual(['child', 'low_lunge', 'athlete_boat', 'mountain']);
    expect(filterYogaPoses(poses, { ...all, search: 'BOAT' }).map(entry => entry.drillId)).toEqual(['athlete_boat']);
    expect(filterYogaPoses(poses, { ...all, posture: 'kneeling' }).map(entry => entry.drillId)).toEqual(['child', 'low_lunge']);
    expect(filterYogaPoses(poses, { ...all, status: 'none' }).map(entry => entry.drillId)).toEqual(['child']);
    expect(filterYogaPoses(poses, { ...all, status: 'published' }).map(entry => entry.drillId)).toEqual(['mountain']);
  });

  it('renders the toolbar with posture counts and a no-status filter only when needed, and the load error', () => {
    const html = renderToStaticMarkup(<YogaLibrarySection load={{ kind: 'ready', poses, version: '1.0.3' }} busy={null} message={null} onStatus={() => {}} />);
    expect(html).toContain('Search poses by name or id');
    expect(html).toContain('Kneeling (2)');
    expect(html).toContain('No status (1)');
    const clean = renderToStaticMarkup(<YogaLibrarySection load={{ kind: 'ready', poses: poses.slice(0, 3), version: '1.0.3' }} busy={null} message={null} onStatus={() => {}} />);
    expect(clean).not.toContain('No status');
    const failed = renderToStaticMarkup(<YogaLibrarySection load={{ kind: 'error', message: 'Missing or insufficient permissions.' }} busy={null} message={null} onStatus={() => {}} />);
    expect(failed).toContain('Missing or insufficient permissions.');
  });

  it('keeps the full form status field unchanged when not compact', () => {
    const html = renderToStaticMarkup(<StatusField value="draft" loadedStatus="draft" validation={{ required: true, result: 'pending' }} managed={false} onChange={() => {}} />);
    expect(html).toContain('<span>Status</span>');
    expect(html).toContain('Publishes automatically when validation passes.');
    expect(html).not.toContain('aria-label="Status"');
  });
});
