import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/firebase', () => ({ default: {}, auth: {}, db: {}, storage: {}, cloud: {} }));
import { publishGateError } from '../../../lib/contracts/drillV2';
import { StatusField } from './DrillForm';

const publishedOption = (html: string) => /<option[^>]*value="published"[^>]*>/.exec(html)?.[0] ?? '';

describe('drill editor validation gate', () => {
  it('disables "published" while validation is required and not passed', () => {
    for (const result of ['pending', 'fail'] as const) {
      const html = renderToStaticMarkup(
        <StatusField value="draft" validation={{ required: true, result }} managed={false} onChange={() => {}} />);
      expect(publishedOption(html)).toContain('disabled');
      expect(html).toContain('Publishes automatically when validation passes.');
    }
  });

  it('leaves "published" selectable after a pass, for exempt drills and for drills with no validation field', () => {
    for (const validation of [{ required: true, result: 'pass' as const }, { required: false, result: 'pending' as const }, undefined]) {
      const html = renderToStaticMarkup(<StatusField value="draft" validation={validation} managed={false} onChange={() => {}} />);
      expect(publishedOption(html)).not.toContain('disabled');
      expect(html).not.toContain('Publishes automatically');
    }
  });

  it('still disables "published" for a reviewed production drill', () => {
    const html = renderToStaticMarkup(<StatusField value="draft" managed onChange={() => {}} />);
    expect(publishedOption(html)).toContain('disabled');
  });

  it('refuses to save a published status for an unpassed drill, and allows draft and archived', () => {
    const pending = { required: true, result: 'pending' as const };
    expect(publishGateError('published', pending)).toContain('passing validation');
    expect(publishGateError('published', { required: true, result: 'fail' })).toContain('passing validation');
    expect(publishGateError('draft', pending)).toBeNull();
    expect(publishGateError('archived', pending)).toBeNull();
    expect(publishGateError('published', { required: true, result: 'pass' })).toBeNull();
    expect(publishGateError('published', { required: false, result: 'pending' })).toBeNull();
    expect(publishGateError('published', undefined)).toBeNull();
  });
});
