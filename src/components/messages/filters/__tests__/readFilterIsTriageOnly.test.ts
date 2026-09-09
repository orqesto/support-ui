/**
 * Read/unread belongs to the triage queues and nowhere else.
 *
 * Measured on the CoreSarms workspace (2026-09-09): `read=unread` returned 189 threads
 * and `read=read` returned 3 — the only three conversations that have ever had a
 * `conversation_reads` row. The backend predicate was correct; the column it reads is
 * written ONLY by the triage-gated controls (`isTriageMessage`), so outside triage the
 * filter narrowed on state that does not exist and no row showed or offered it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildFilterDefs,
  EMPTY_DYNAMIC_OPTIONS,
  keyAppliesInMode,
  readAppliesTo,
  scopeReadToTriage,
  visibleDefs,
} from '../filterSchema';
import { useMessagesStore, defaultFilters } from '@/stores/messagesStore';
import type { FilterState } from '@/stores/messagesStore';

const defs = buildFilterDefs(EMPTY_DYNAMIC_OPTIONS);
const keys = (lens: Pick<FilterState, 'queue' | 'columnId'>) =>
  visibleDefs(defs, false, lens).map((def) => def.key);

describe('readAppliesTo', () => {
  it('is true for a triage QUEUE (the dropdown / token bar route)', () => {
    for (const queue of ['not_analysed', 'archived', 'suspicious', 'spam'] as const) {
      expect(readAppliesTo({ queue, columnId: 'all' })).toBe(true);
    }
  });

  it('is true for a triage COLUMN (the quick-chip route)', () => {
    // ⛔ The regression this exists for: clicking the Suspicious/Spam chip sets `columnId`
    // and explicitly zeroes `queue`, so a queue-only predicate hid the control on exactly
    // the lenses read state lives in.
    for (const columnId of ['not_analysed', 'archived', 'suspicious', 'spam'] as const) {
      expect(readAppliesTo({ queue: 'all', columnId })).toBe(true);
    }
  });

  it('is false for every non-triage lens', () => {
    expect(readAppliesTo({ queue: 'all', columnId: 'all' })).toBe(false);
    expect(readAppliesTo({ queue: 'outbound_echo', columnId: 'all' })).toBe(false);
    // `needs_routing` is a triage-AXIS column but writes no read state — it is not in
    // TRIAGE_READ_COLUMN_IDS, and the dot does not render there either.
    expect(readAppliesTo({ queue: 'needs_routing', columnId: 'open' })).toBe(false);
    expect(readAppliesTo({ queue: undefined, columnId: undefined })).toBe(false);
  });
});

describe('the read control', () => {
  it('is offered under a triage queue', () => {
    expect(keys({ queue: 'suspicious', columnId: 'all' })).toContain('read');
    expect(keyAppliesInMode('read', false, { queue: 'spam', columnId: 'all' })).toBe(true);
  });

  it('is offered under a triage column chosen by chip', () => {
    expect(keys({ queue: 'all', columnId: 'spam' })).toContain('read');
    expect(keys({ queue: 'all', columnId: 'suspicious' })).toContain('read');
  });

  it('is hidden with no lens, or a non-triage one', () => {
    expect(keys({ queue: 'all', columnId: 'all' })).not.toContain('read');
    expect(keys({ queue: 'outbound_echo', columnId: 'all' })).not.toContain('read');
    expect(keys({ queue: 'all', columnId: 'in_progress' })).not.toContain('read');
    // Other list filters are untouched — this narrows one key, not the bar.
    expect(keys({ queue: 'all', columnId: 'all' })).toContain('queue');
    expect(keys({ queue: 'all', columnId: 'all' })).toContain('lifecycle');
  });

  it('still answers the mode-only question when no filters are given', () => {
    expect(keyAppliesInMode('read', false)).toBe(true);
    expect(keyAppliesInMode('read', true)).toBe(false);
  });
});

describe('scopeReadToTriage', () => {
  it('keeps read under a triage queue', () => {
    const filters = { ...defaultFilters, queue: 'spam' as const, read: 'unread' as const };
    expect(scopeReadToTriage(filters).read).toBe('unread');
  });

  it('keeps read under a chip-selected triage column, where queue is zeroed', () => {
    const filters = { ...defaultFilters, columnId: 'suspicious', read: 'unread' as const };
    expect(scopeReadToTriage(filters).read).toBe('unread');
  });

  it('drops read once the queue is not a triage one', () => {
    const filters = { ...defaultFilters, queue: 'all' as const, read: 'unread' as const };
    expect(scopeReadToTriage(filters).read).toBe('all');
  });
});

describe('the store', () => {
  beforeEach(() => {
    useMessagesStore.setState({ filters: defaultFilters, cache: {} });
  });

  it('survives the chip patch that zeroes the queue', () => {
    // MessagesPage patches { columnId, lifecycle: 'all', queue: 'all' } on a chip click.
    useMessagesStore.getState().setFilters({ queue: 'spam', read: 'unread' });
    useMessagesStore
      .getState()
      .setFilters({ columnId: 'spam', lifecycle: 'all', queue: 'all' });
    expect(useMessagesStore.getState().filters.read).toBe('unread');
  });

  it('clears a set read when the lens moves off triage', () => {
    const { setFilters, updateFilter } = useMessagesStore.getState();
    setFilters({ queue: 'suspicious', read: 'unread' });
    expect(useMessagesStore.getState().filters.read).toBe('unread');

    // The patch names only the queue: the invariant must run on the MERGED filters,
    // or the hidden control keeps narrowing the list from the URL.
    updateFilter('queue', 'all');
    expect(useMessagesStore.getState().filters.read).toBe('all');
  });

  it('refuses a read arriving alongside a non-triage queue (a shared URL)', () => {
    useMessagesStore.getState().setFilters({ queue: 'outbound_echo', read: 'read' });
    expect(useMessagesStore.getState().filters.read).toBe('all');
  });
});
