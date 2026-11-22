/**
 * The restricted-topics fields of GET /api/organizations/auto-reply arrive as the backend sent
 * them (the service checks nothing: only this page reads them). An older backend sends none, and
 * a malformed one must not break the page: read here. Invented data.
 */
import { describe, expect, it } from 'vitest';
import { readBuiltInTopics, readRestrictedTopics } from '../restrictedTopics';
import { readTopicTeams } from '../OtherTeamTopics';

describe('the page reads the restricted-topics fields defensively', () => {
  it.each([[undefined], [null], [{}], ['refunds'], [7]])(
    'not a list (%j): the lists are null ("not sent"), the built-in topics empty',
    (value) => {
      expect(readRestrictedTopics(value)).toBeNull();
      expect(readTopicTeams(value)).toBeNull();
      expect(readBuiltInTopics(value)).toEqual([]);
    }
  );

  it('the workspace list: strings only, blanks dropped', () => {
    expect(readRestrictedTopics(['refund disputes', '', '  ', 3, null])).toEqual([
      'refund disputes',
    ]);
  });

  it('the built-in topics: entries with a key and a label only', () => {
    expect(
      readBuiltInTopics([
        { key: 'dosing', label: 'Dosing' },
        { key: 'no_label', label: '' },
        { label: 'No key' },
        null,
        'dosing',
      ])
    ).toEqual([{ key: 'dosing', label: 'Dosing' }]);
  });

  it('the teams with stored topics: well-formed entries that still hold a topic', () => {
    expect(
      readTopicTeams([
        { departmentId: 3, name: 'Returns', active: false, restrictedTopics: ['chargebacks', ''] },
        { departmentId: 5, name: '', active: true, restrictedTopics: ['press requests'] },
        { departmentId: 6, name: 'Empty', active: true, restrictedTopics: [] },
        { name: 'No id', restrictedTopics: ['x'] },
        null,
      ])
    ).toEqual([
      { departmentId: 3, name: 'Returns', active: false, restrictedTopics: ['chargebacks'] },
      { departmentId: 5, name: null, active: true, restrictedTopics: ['press requests'] },
    ]);
  });
});
