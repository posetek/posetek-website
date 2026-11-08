import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/firebase', () => ({ default: {}, auth: {}, db: {}, storage: {}, cloud: {} }));
import { publishGateError } from '../../../lib/contracts/drillV2';
import { StatusField } from './DrillForm';

const publishedOption = (html: string) => /<option[^>]*value="published"[^>]*>/.exec(html)?.[0] ?? '';

describe('drill editor validation gate', () => {
  it('disables "published" for a not-yet-published drill while validation is required and not passed', () => {
    for (const result of ['pending', 'fail'] as const) {
      for (const loadedStatus of ['draft', 'archived'] as const) {
        const html = renderToStaticMarkup(
          <StatusField value={loadedStatus} loadedStatus={loadedStatus} validation={{ required: true, result }} managed={false} onChange={() => {}} />);
        expect(publishedOption(html)).toContain('disabled');
        expect(html).toContain('Publishes automatically when validation passes.');
      }
    }
  });

  it('keeps "published" selectable, with no note, for a drill that is already published', () => {
    const html = renderToStaticMarkup(
      <StatusField value="published" loadedStatus="published" validation={{ required: true, result: 'fail' }} managed={false} onChange={() => {}} />);
    expect(publishedOption(html)).not.toContain('disabled');
    expect(html).not.toContain('Publishes automatically');
  });

  it('leaves "published" selectable after a pass, for exempt drills and for drills with no validation field', () => {
    for (const validation of [{ required: true, result: 'pass' as const }, { required: false, result: 'pending' as const }, undefined]) {
      const html = renderToStaticMarkup(<StatusField value="draft" loadedStatus="draft" validation={validation} managed={false} onChange={() => {}} />);
      expect(publishedOption(html)).not.toContain('disabled');
      expect(html).not.toContain('Publishes automatically');
    }
  });

  it('still disables "published" for a reviewed production drill', () => {
    const html = renderToStaticMarkup(<StatusField value="draft" loadedStatus="draft" managed onChange={() => {}} />);
    expect(publishedOption(html)).toContain('disabled');
  });

  it('refuses only the transition to published for an unpassed drill', () => {
    const pending = { required: true, result: 'pending' as const };
    const failed = { required: true, result: 'fail' as const };
    expect(publishGateError('published', 'draft', pending)).toContain('passing validation');
    expect(publishGateError('published', 'archived', failed)).toContain('passing validation');
    expect(publishGateError('published', undefined, pending)).toContain('passing validation');
    expect(publishGateError('published', 'published', failed)).toBeNull();
    expect(publishGateError('draft', 'draft', pending)).toBeNull();
    expect(publishGateError('archived', 'published', failed)).toBeNull();
    expect(publishGateError('published', 'draft', { required: true, result: 'pass' })).toBeNull();
    expect(publishGateError('published', 'draft', { required: false, result: 'pending' })).toBeNull();
    expect(publishGateError('published', 'draft', undefined)).toBeNull();
  });
});
