/**
 * Contacts sends the same symbolic assignee values the list and the board do.
 *
 * This builder lived as an inline IIFE inside MessagesPage, where no test could reach it —
 * and it carried the board's defect: `'me'` passed through as though it were a user id.
 * `parseInt('me')` is NaN, so the predicate became `assignee_id = NaN`; since BE #754 an
 * unusable id fails closed, which turns the error into an empty contact list.
 *
 * The non-assignee cases are here as CONTROLS: the extraction must not change them, so a
 * regression in the move shows up as a failure rather than as a quietly different query.
 */
import { describe, expect, it } from 'vitest';
import { buildContactsApiFilters } from '../contactsApiFilters';
import { defaultFilters } from '@/stores/messagesStore';

describe('the contacts view and the symbolic assignee values', () => {
  it('sends "Mine" as the boolean the API resolves against the caller', () => {
    const api = buildContactsApiFilters({ ...defaultFilters, assigneeId: 'me' });
    expect(api.assignedToMe).toBe('true');
    expect(api.assigneeId).toBeUndefined();
  });

  it('CONTROL: "Unassigned" still goes as 0', () => {
    const api = buildContactsApiFilters({ ...defaultFilters, assigneeId: 'unassigned' });
    expect(api.assigneeId).toBe('0');
    expect(api.assignedToMe).toBeUndefined();
  });

  it('CONTROL: a real user id passes through', () => {
    const api = buildContactsApiFilters({ ...defaultFilters, assigneeId: '7' });
    expect(api.assigneeId).toBe('7');
    expect(api.assignedToMe).toBeUndefined();
  });
});

describe('the extraction changed nothing else', () => {
  it('defaults to the work_queue lens', () => {
    expect(buildContactsApiFilters({ ...defaultFilters }).view).toBe('work_queue');
  });

  it('keeps the needs_routing sentinel as a view, not a department', () => {
    const api = buildContactsApiFilters({ ...defaultFilters, departmentId: 'needs_routing' });
    expect(api.view).toBe('needs_routing');
    expect(api.departmentId).toBeUndefined();
  });

  it('still maps a real department, a status, an aiState and a trimmed search', () => {
    const api = buildContactsApiFilters({
      ...defaultFilters,
      departmentId: '7',
      status: 'resolved',
      aiState: 'lead',
      search: '  ada@example.com  ',
    });
    expect(api.departmentId).toBe('7');
    expect(api.view).toBe('resolved');
    expect(api.isLead).toBe('true');
    expect(api.search).toBe('ada@example.com');
  });
});
