import { describe, it, expect } from 'vitest';
import { getInitials } from '../initials';

describe('getInitials', () => {
  it('ignores the quotes around a display name', () => {
    expect(getInitials('"Joel @ ngrok" <team@m.ngrok.com>')).toBe('JN');
  });
  it('CONTROL: a plain name and a bare address still work', () => {
    expect(getInitials('Marta Kowalczyk <marta@x.example>')).toBe('MK');
    expect(getInitials('qwerty@gmail.com')).toBe('QG');
    expect(getInitials('')).toBe('?');
  });
  // A record without the name (a list row's) took the whole page down via the header (2026-10-31).
  it('a missing name is "?", not a crash', () => {
    expect(getInitials(undefined)).toBe('?');
    expect(getInitials(null)).toBe('?');
  });
  it('every <…> part is dropped, nested or unclosed — only the initials are left', () => {
    expect(getInitials('Ann Lee <<script>ann@x.example>')).toBe('AL');
    expect(getInitials('Ann Lee <ann@x.example')).toBe('AL');
    expect(getInitials('<a><b>Bo Ray')).toBe('BR');
  });
  // A bare `<address>` read `<J` on the list and board (2026-11-08): the address is the name.
  it('a name that is only <address> reads the address', () => {
    expect(getInitials('<jane@example.com>')).toBe('JE');
    expect(getInitials('  <jane.doe@example.com>  ')).toBe('JD');
  });
  it('one word gives one letter, the same on every screen', () => {
    expect(getInitials('Ann')).toBe('A');
    expect(getInitials('<>')).toBe('?');
  });
});
