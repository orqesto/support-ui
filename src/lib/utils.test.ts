import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn()', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('deduplicates conflicting Tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles empty string input', () => {
    expect(cn('', 'a')).toBe('a');
  });

  it('returns empty string with no args', () => {
    expect(cn()).toBe('');
  });
});
