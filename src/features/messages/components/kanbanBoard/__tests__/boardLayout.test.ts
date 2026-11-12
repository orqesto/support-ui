import { describe, expect, it } from 'vitest';
import { boardLayoutFor, byLayout } from '../boardLayout';

describe('boardLayoutFor', () => {
  it('lays three lanes side by side once each gets 260px', () => {
    // 3 × 260 + 2 × 12 gaps = 804
    expect(boardLayoutFor(804, 3)).toBe('columns');
    expect(boardLayoutFor(803, 3)).toBe('rows');
  });

  it('stacks the lanes beside an open thread (half a 1440px window)', () => {
    expect(boardLayoutFor(555, 3)).toBe('rows');
    expect(boardLayoutFor(1032, 5)).toBe('rows');
    expect(boardLayoutFor(1400, 5)).toBe('columns');
  });
});

describe('byLayout', () => {
  const classes = { xl: 'xl:flex-row', columns: 'flex-row' };
  it('unmeasured: by the window', () => expect(byLayout(undefined, classes)).toBe('xl:flex-row'));
  it('columns: unprefixed', () => expect(byLayout('columns', classes)).toBe('flex-row'));
  it('rows: none', () => expect(byLayout('rows', classes)).toBe(''));
});
