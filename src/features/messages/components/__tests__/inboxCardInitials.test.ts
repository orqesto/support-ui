/**
 * The list/board avatar initials (inboxCardHelpers.getInitials). Its `<…>` strip moved from a regex
 * to slicing (CodeQL js/incomplete-multi-character-sanitization: the output is never HTML); these
 * pin that the initials did not change.
 */
import { describe, expect, it } from 'vitest';
import { getInitials } from '../inboxCardHelpers';

describe('inbox card initials', () => {
  it('drops the address part of "Name <address>"', () => {
    expect(getInitials('Jane Doe <jane@example.com>')).toBe('JD');
    // Without the strip this would read "Jane", "<jane", "doe" and give "J<".
    expect(getInitials('Jane <jane.doe@example.com>')).toBe('JA');
  });

  it('drops an unclosed address part too', () => {
    expect(getInitials('Ann Lee <ann@x.example')).toBe('AL');
  });

  it('CONTROL: a bare address and a single name still give two letters', () => {
    expect(getInitials('jane.doe@example.com')).toBe('JD');
    expect(getInitials('qwerty@example.com')).toBe('QW');
    expect(getInitials('Ann')).toBe('AN');
  });

  it('nothing to show is two dots', () => {
    expect(getInitials('   ')).toBe('··');
    expect(getInitials(null)).toBe('··');
  });
});
