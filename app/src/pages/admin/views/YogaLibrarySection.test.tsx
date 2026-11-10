import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/firebase', () => ({ default: {}, auth: {}, db: {}, storage: {}, cloud: {} }));
import { normalizeYogaPose } from '../../../lib/contracts/yogaLibrary';
import YogaLibrarySection, { YogaPoseRows } from './YogaLibrarySection';
import { filterYogaPoses } from '../lib/useYogaLibrary';
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
    expect(html.match(/aria-label="Status"/g)).toHaveLength(4);
    expect(html).toContain('data-status="archived"');
    expect(html).toContain('data-status="none"');
    expect(selected(html, 'Mountain')).toBe('published');
    expect(selected(html, 'Boat')).toBe('archived');
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
    const html = renderToStaticMarkup(<YogaLibrarySection load={{ kind: 'ready', poses, version: '1.0.3' }} busy={null} error={null} onStatus={() => {}} />);
    expect(html).toContain('Search poses by name or id');
    expect(html).toContain('Kneeling (2)');
    expect(html).toContain('No status (1)');
    const clean = renderToStaticMarkup(<YogaLibrarySection load={{ kind: 'ready', poses: poses.slice(0, 3), version: '1.0.3' }} busy={null} error={null} onStatus={() => {}} />);
    expect(clean).not.toContain('No status');
    const failed = renderToStaticMarkup(<YogaLibrarySection load={{ kind: 'error', message: 'Missing or insufficient permissions.' }} busy={null} error={null} onStatus={() => {}} />);
    expect(failed).toContain('Missing or insufficient permissions.');
  });

  it('keeps the full form status field unchanged when not compact', () => {
    const html = renderToStaticMarkup(<StatusField value="draft" loadedStatus="draft" validation={{ required: true, result: 'pending' }} managed={false} onChange={() => {}} />);
    expect(html).toContain('<span>Status</span>');
    expect(html).toContain('Publishes automatically when validation passes.');
    expect(html).not.toContain('aria-label="Status"');
  });
});
