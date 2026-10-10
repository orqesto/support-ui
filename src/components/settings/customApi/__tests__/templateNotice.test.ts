import { describe, it, expect } from 'vitest';
import { partialTemplateNotice } from '../templateNotice';
import type { TemplateLookup } from '@/services/customApiTemplates.service';

const lookups = [{ key: 'a' }, { key: 'b' }, { key: 'c' }] as unknown as TemplateLookup[];

describe('partialTemplateNotice', () => {
  it('names several steps not added in one sentence', () => {
    expect(partialTemplateNotice(lookups, { 0: { label: 'Orders', existing: false } })).toBe(
      'Step 1 was saved as “Orders”. Steps 2 and 3 were not added — start the template again to add them.'
    );
  });

  it('says nothing when nothing was kept, or when every step was', () => {
    expect(partialTemplateNotice(lookups, {})).toBeUndefined();
    const all = {
      0: { label: 'A', existing: false },
      1: { label: 'B', existing: true },
      2: { label: 'C', existing: false },
    };
    expect(partialTemplateNotice(lookups, all)).toBeUndefined();
  });
});
