import { describe, it, expect } from 'vitest';
import { getInitials } from '../messageDetailConstants';

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
});
