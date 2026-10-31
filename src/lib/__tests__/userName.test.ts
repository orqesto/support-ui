import { describe, expect, it } from 'vitest';
import { userFullName } from '../userName';

describe('userFullName', () => {
  it('joins first and last name', () => {
    expect(userFullName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace');
  });

  it('never prints a missing last name as "null" (the assignee picker showed "moderator null")', () => {
    expect(userFullName({ firstName: 'moderator', lastName: null })).toBe('moderator');
    expect(userFullName({ firstName: 'moderator' })).toBe('moderator');
    expect(userFullName({ firstName: 'moderator', lastName: '  ' })).toBe('moderator');
  });

  it('a missing first name leaves the last name alone, and no name is empty', () => {
    expect(userFullName({ firstName: null, lastName: 'Lovelace' })).toBe('Lovelace');
    expect(userFullName({})).toBe('');
  });
});
