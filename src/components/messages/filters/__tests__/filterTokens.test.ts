/**
 * The matching rules behind the token bar.
 *
 * The headline claim of the redesign is that you can type a VALUE — "spam", "unassigned",
 * "high" — without knowing which filter owns it. The old panel required you to know that
 * Spam lives under a control named "Queue", which is the failure this replaces. That is
 * the behaviour worth pinning down; the popover chrome around it is not.
 */
import { describe, it, expect } from 'vitest';
import {
  buildFilterDefs,
  visibleDefs,
  EMPTY_DYNAMIC_OPTIONS,
  type DynamicOptions,
} from '../filterSchema';
import { suggestionsFor, tokensOf, tokenText } from '../filterTokens';
import type { FilterState } from '@/stores/messagesStore';

const dynamic: DynamicOptions = {
  ...EMPTY_DYNAMIC_OPTIONS,
  assignees: [
    { value: 'me', label: 'Me' },
    { value: 'unassigned', label: 'Unassigned' },
  ],
  departments: [{ value: '1', label: 'Support', dot: '#3b82f6' }],
  labels: [{ value: '4', label: 'VIP', dot: '#a855f7' }],
};

const defs = buildFilterDefs(dynamic);
const keys = (list: { def: { key: string } }[]) => list.map((row) => row.def.key);

describe('suggestionsFor — values are searchable, not just filter names', () => {
  it('offers queue:Spam for "spam" without the word Queue being typed', () => {
    const hits = suggestionsFor(defs, 'spam', false);
    const value = hits.find((hit) => hit.kind === 'value' && hit.option.value === 'spam');
    expect(value).toBeTruthy();
    expect(value && value.kind === 'value' && value.def.key).toBe('queue');
  });

  it('resolves an assignee value the same way', () => {
    const hits = suggestionsFor(defs, 'unassigned', false);
    expect(hits.some((hit) => hit.kind === 'value' && hit.def.key === 'assigneeId')).toBe(true);
  });

  it('still matches filter names', () => {
    const hits = suggestionsFor(defs, 'priority', false);
    expect(hits.some((hit) => hit.kind === 'filter' && hit.def.key === 'priority')).toBe(true);
  });

  it('always leads with the free-text option so any query can become a search', () => {
    const hits = suggestionsFor(defs, 'refund', false);
    expect(hits[0]).toEqual({ kind: 'free', query: 'refund' });
  });

  it('returns nothing for a blank query — the caller browses instead', () => {
    expect(suggestionsFor(defs, '   ', false)).toEqual([]);
  });

  it('never offers a filter the current board mode hides', () => {
    // "status" names both lifecycle (list) and threadStatus (kanban).
    const inList = suggestionsFor(defs, 'status', false).filter((hit) => hit.kind !== 'free');
    const inKanban = suggestionsFor(defs, 'status', true).filter((hit) => hit.kind !== 'free');
    expect(inList.some((hit) => hit.def.key === 'lifecycle')).toBe(true);
    expect(inList.some((hit) => hit.def.key === 'threadStatus')).toBe(false);
    expect(inKanban.some((hit) => hit.def.key === 'threadStatus')).toBe(true);
    expect(inKanban.some((hit) => hit.def.key === 'lifecycle')).toBe(false);
  });
});

describe('buildFilterDefs — a picker with nothing in it is a dead end', () => {
  it('drops select filters whose options the workspace has not got', () => {
    const bare = buildFilterDefs(EMPTY_DYNAMIC_OPTIONS).map((def) => def.key);
    expect(bare).not.toContain('labelId');
    expect(bare).not.toContain('departmentId');
    expect(bare).not.toContain('assigneeId');
    // Constants are always available, so these survive an empty workspace.
    expect(bare).toContain('priority');
    expect(bare).toContain('slaBreached');
  });

  it('keeps them once the workspace has options', () => {
    expect(defs.map((def) => def.key)).toContain('labelId');
  });
});

describe('tokensOf', () => {
  const filters = {
    lifecycle: 'open',
    priority: 'high',
    labelId: '4',
    slaBreached: true,
    queue: 'all',
    assigneeId: 'all',
  } as FilterState;

  it('tokenises only what is actually set — "all" and false are off', () => {
    expect(keys(tokensOf(defs, filters, false))).toEqual([
      'lifecycle',
      'priority',
      'labelId',
      'slaBreached',
    ]);
  });

  it('orders by the schema, so the bar does not reshuffle as filters are added', () => {
    const reordered = { slaBreached: true, lifecycle: 'open' } as FilterState;
    expect(keys(tokensOf(defs, reordered, false))).toEqual(['lifecycle', 'slaBreached']);
  });

  it('hides a list-only filter in kanban mode even when it is set', () => {
    expect(keys(tokensOf(defs, filters, true))).not.toContain('lifecycle');
  });

  it('carries the option colour through for the token dot', () => {
    const [, , label] = tokensOf(defs, filters, false);
    expect(label.dot).toBe('#a855f7');
  });
});

describe('tokenText', () => {
  const linked = defs.find((def) => def.key === 'linked');

  it('reads as the option label, not the raw value', () => {
    const priority = defs.find((def) => def.key === 'priority');
    expect(priority && tokenText(priority, 'high', {} as FilterState)).toBe('High');
  });

  it('folds the sub-value in so one token says both halves', () => {
    const filters = { linked: 'has_ticket', linkedTicketStatus: 'open' } as FilterState;
    expect(linked && tokenText(linked, 'has_ticket', filters)).toBe('Has Ticket · Open');
  });

  it('omits the sub-value when it is unset', () => {
    expect(linked && tokenText(linked, 'has_ticket', {} as FilterState)).toBe('Has Ticket');
  });
});

describe('visibleDefs', () => {
  it('hides the filters the kanban columns already express', () => {
    const inKanban = visibleDefs(defs, true).map((def) => def.key);
    for (const hidden of ['lifecycle', 'queue', 'read']) expect(inKanban).not.toContain(hidden);
    expect(inKanban).toContain('threadStatus');
  });
});
