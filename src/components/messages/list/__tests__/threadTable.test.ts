import { describe, expect, it } from 'vitest';
import { defaultFilters, type FilterState } from '@/stores/messagesStore';
import type { MessageThread } from '@/services/message.service';
import type { FilterDef } from '@/components/messages/filters/filterSchema';
import { threadSections } from '../threadSections';
import { pickPatch } from '../ThreadTableHeader';

const thread = (
  id: string,
  status: string,
  lastReplyFromClient: boolean | null,
  parkedAt?: string
) =>
  ({
    threadId: id,
    lastReplyFromClient,
    latestMessage: { id: 1, status, parkedAt: parkedAt ?? null, lastReplyFromClient },
  }) as unknown as MessageThread;

describe('threadSections — Group by status', () => {
  const rows = [
    thread('a', 'resolved', null),
    thread('b', 'open', true), // in progress
    thread('c', 'open', null), // open
    thread('d', 'filtered', null), // triage
    thread('e', 'open', null), // open
  ];

  it('orders sections as the board lanes, keeps the list order inside, heads each section once', () => {
    const out = threadSections(rows, true);
    expect(out.map((row) => row.thread.threadId)).toEqual(['c', 'e', 'b', 'a', 'd']);
    expect(out.map((row) => row.section && [row.section.status, row.section.count])).toEqual([
      ['open', 2],
      null,
      ['in_progress', 1],
      ['resolved', 1],
      [null, 1],
    ]);
  });

  it('ungrouped: the rows as they are, no headings', () => {
    const out = threadSections(rows, false);
    expect(out.map((row) => row.thread.threadId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(out.every((row) => row.section === null)).toBe(true);
  });
});

describe('pickPatch — a column menu pick writes what the token bar would', () => {
  const filters = (over: Partial<FilterState> = {}): FilterState => ({
    ...defaultFilters,
    ...over,
  });
  const def = (over: Partial<FilterDef>) =>
    ({ label: 'x', group: 'Queue', kind: 'select', ...over }) as FilterDef;

  it('a status clears the queue and a triage lane (they partition disjoint sets)', () => {
    expect(
      pickPatch(filters({ queue: 'spam', columnId: 'spam' }), def({ key: 'lifecycle' }), 'open')
    ).toEqual({
      lifecycle: 'open',
      queue: 'all',
      columnId: 'all',
    });
  });

  it('picking the active value again turns the filter off', () => {
    expect(pickPatch(filters({ assigneeId: 'me' }), def({ key: 'assigneeId' }), 'me')).toEqual({
      assigneeId: 'all',
    });
  });

  it('priority toggles inside its list', () => {
    const priority = def({ key: 'priority', multi: true });
    expect(pickPatch(filters({ priority: 'high' }), priority, 'critical')).toEqual({
      priority: 'high,critical',
    });
    expect(pickPatch(filters({ priority: 'high,critical' }), priority, 'high')).toEqual({
      priority: 'critical',
    });
    expect(pickPatch(filters({ priority: 'high' }), priority, 'high')).toEqual({ priority: 'all' });
  });

  it('a Received bucket replaces an explicit date range', () => {
    expect(
      pickPatch(
        filters({ receivedFrom: '2026-10-01', receivedTo: '2026-10-02' }),
        def({ key: 'received', kind: 'date' }),
        'today'
      )
    ).toEqual({ ageRange: 'today', receivedFrom: undefined, receivedTo: undefined });
  });
});
