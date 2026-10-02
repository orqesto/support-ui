/**
 * FE audit 2026-09-29, A-H3: the category select's "None" (value `''`) became
 * `categoryId: undefined`, which JSON.stringify drops; the PUT body was `{}` and the backend
 * kept the old category while the select showed None. The backend clears on `null`.
 */
import { describe, it, expect } from 'vitest';
import { ticketFieldPatch } from '../ticketFieldPatch';

describe('ticketFieldPatch', () => {
  it('"None" sends categoryId: null, which the backend reads as "clear"', () => {
    expect(ticketFieldPatch('categoryId', '')).toEqual({ categoryId: null });
    expect(JSON.stringify(ticketFieldPatch('categoryId', ''))).toBe('{"categoryId":null}');
  });

  it('a chosen category sends its number', () => {
    expect(ticketFieldPatch('categoryId', '12')).toEqual({ categoryId: 12 });
  });

  it('CONTROL: other fields pass through as strings', () => {
    expect(ticketFieldPatch('status', 'resolved')).toEqual({ status: 'resolved' });
    expect(ticketFieldPatch('description', 'x')).toEqual({ description: 'x' });
  });
});
