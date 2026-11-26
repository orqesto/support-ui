import { describe, it, expect } from 'vitest';
import { sameFormValues } from '@/lib/sameFormValues';

describe('sameFormValues', () => {
  it('reads forms that would save the same thing as equal', () => {
    expect(sameFormValues({ name: 'rule_a', note: 'x' }, { name: 'rule_a', note: 'x' })).toBe(true);
    expect(sameFormValues({ name: ' rule_a ' }, { name: 'rule_a' })).toBe(true);
    expect(sameFormValues({ exampleText: '' }, { exampleText: null })).toBe(true);
    expect(sameFormValues({ exampleText: undefined }, {})).toBe(true);
    expect(sameFormValues({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toBe(true);
  });

  it('reads any real difference as a touched form', () => {
    expect(sameFormValues({ name: 'rule_a' }, { name: 'rule_b' })).toBe(false);
    expect(sameFormValues({ weight: 1 }, { weight: 2 })).toBe(false);
    expect(sameFormValues({ active: true }, { active: false })).toBe(false);
    expect(sameFormValues({ departmentId: null }, { departmentId: 3 })).toBe(false);
    expect(sameFormValues({ exampleText: 'x' }, { exampleText: null })).toBe(false);
    expect(sameFormValues({ tags: ['a'] }, { tags: ['a', 'b'] })).toBe(false);
    expect(sameFormValues({ name: 'rule_a', extra: 'x' }, { name: 'rule_a' })).toBe(false);
  });
});
