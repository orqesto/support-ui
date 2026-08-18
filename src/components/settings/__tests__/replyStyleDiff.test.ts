import { describe, it, expect } from 'vitest';
import { diffWords, hasRealChange } from '@/components/settings/replyStyleDiff';

const render = (segments: ReturnType<typeof diffWords>, type: 'same' | 'added' | 'removed') =>
  segments
    .filter((segment) => segment.type === type)
    .map((segment) => segment.text)
    .join('');

describe('replyStyleDiff', () => {
  it('rejoins losslessly — the "same" + "removed" text reconstructs the original', () => {
    const before = 'Be warm but brief.\nAlways greet the customer by name.';
    const after = 'Be warm and direct.\nAlways greet the customer by name.';
    const segments = diffWords(before, after);
    const reconstructedBefore = segments
      .filter((segment) => segment.type !== 'added')
      .map((segment) => segment.text)
      .join('');
    const reconstructedAfter = segments
      .filter((segment) => segment.type !== 'removed')
      .map((segment) => segment.text)
      .join('');
    expect(reconstructedBefore).toBe(before);
    expect(reconstructedAfter).toBe(after);
  });

  it('marks only the words that actually changed', () => {
    const segments = diffWords('Be warm but brief.', 'Be warm but concise.');
    expect(render(segments, 'removed')).toBe('brief.');
    expect(render(segments, 'added')).toBe('concise.');
    expect(render(segments, 'same')).toContain('Be warm but');
  });

  // Control for the test above: identical text must produce NO highlight at all.
  // Without this, a diff that marked everything as changed would still pass the
  // "the changed word is marked" assertion.
  it('identical text produces no added or removed segments', () => {
    const segments = diffWords('Be warm but brief.', 'Be warm but brief.');
    expect(segments.every((segment) => segment.type === 'same')).toBe(true);
  });

  it('handles a first-ever style (no current guidance) as a pure addition', () => {
    const segments = diffWords('', 'Keep replies under six sentences.');
    expect(segments).toEqual([{ type: 'added', text: 'Keep replies under six sentences.' }]);
  });

  it('falls back to a block replace when a side is implausibly long', () => {
    const long = Array.from({ length: 1500 }, (_, index) => `word${index}`).join(' ');
    const segments = diffWords(long, `${long} extra`);
    expect(segments.map((segment) => segment.type)).toEqual(['removed', 'added']);
  });

  it('hasRealChange ignores surrounding whitespace only', () => {
    expect(hasRealChange('  Be brief.  ', 'Be brief.')).toBe(false);
    expect(hasRealChange('Be brief.', 'Be brief and warm.')).toBe(true);
  });
});
