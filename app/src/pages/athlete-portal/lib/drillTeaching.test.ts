import { describe, expect, it } from 'vitest';
import { teachingLinesFor } from './drillTeaching';

describe('workout player how-to lines', () => {
  it('reads the v2 howTo fields', () => {
    expect(teachingLinesFor({ schemaVersion: 2, howTo: { setup: 'Mat down.', steps: ['Sit.', 'Stand.'] } })).toEqual([
      { icon: 'grid_on', label: 'Set up', text: 'Mat down.' },
      { icon: 'sprint', label: 'Do it', text: 'Sit. Stand.' },
    ]);
  });
  it('still reads the v1 field names', () => {
    expect(teachingLinesFor({ setup: 'Cones.', execution: 'Weave.', successCriteria: 'Clean touches.' }).map(line => line.label))
      .toEqual(['Set up', 'Do it', 'Done well']);
  });
  it('returns nothing for an empty document', () => {
    expect(teachingLinesFor({})).toEqual([]);
    expect(teachingLinesFor(null)).toEqual([]);
  });
});
