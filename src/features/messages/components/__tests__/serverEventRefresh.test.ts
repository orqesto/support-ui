import { describe, expect, it } from 'vitest';
import { defaultFilters, type FilterState } from '@/stores/messagesStore';
import type { MessageThread } from '@/services/message.service';
import { refreshForServerEvent, type ShownView } from '../serverEventRefresh';

const row = (id: number, extra: Partial<MessageThread> = {}) =>
  ({
    threadId: `conv_${id}`,
    hasTicket: false,
    latestMessage: { id },
    latestIncomingMessage: null,
    ...extra,
  }) as unknown as MessageThread;

const view = (
  overrides: Partial<ShownView> = {},
  filters: Partial<FilterState> = {}
): ShownView => ({
  displayMode: 'threads',
  page: 1,
  filters: { ...defaultFilters, ...filters },
  rows: [row(11), row(12)],
  ...overrides,
});
const teamFive = { departmentId: '5' };

describe('which server events re-read the thread list', () => {
  describe('ticket:updated', () => {
    it('no ticket on screen and no ticket filter: the counts only', () => {
      expect(refreshForServerEvent('ticket:updated', { ticketId: 7 }, view())).toBe('counts');
    });
    it('a row on screen has a ticket (its chip may be this one): the list', () => {
      const rows = [row(11), row(12, { hasTicket: true })];
      expect(refreshForServerEvent('ticket:updated', { ticketId: 7 }, view({ rows }))).toBe('list');
      const counted = [row(11, { ticketCount: 2 })];
      expect(refreshForServerEvent('ticket:updated', {}, view({ rows: counted }))).toBe('list');
    });
    it('filtered by a ticket status, a row can enter: the list', () => {
      expect(
        refreshForServerEvent('ticket:updated', {}, view({}, { linkedTicketStatus: 'resolved' }))
      ).toBe('list');
      expect(refreshForServerEvent('ticket:updated', {}, view({}, { linked: 'has_ticket' }))).toBe(
        'list'
      );
    });
  });

  describe('conversation:routed and conv:status_changed', () => {
    it('a thread not on screen, into another team than the one the list shows: the counts only', () => {
      const payload = { conversationId: 99, departmentId: 8 };
      expect(refreshForServerEvent('conversation:routed', payload, view({}, teamFive))).toBe(
        'counts'
      );
      expect(refreshForServerEvent('conv:status_changed', payload, view({}, teamFive))).toBe(
        'counts'
      );
    });
    it('into the team the list shows — it may now belong: the list', () => {
      const payload = { conversationId: 99, departmentId: 5 };
      expect(refreshForServerEvent('conversation:routed', payload, view({}, teamFive))).toBe(
        'list'
      );
      expect(
        refreshForServerEvent('conversation:routed', payload, view({}, { departmentId: '3,5' }))
      ).toBe('list');
    });
    it('a thread on screen: the list (no endpoint re-reads one row)', () => {
      const payload = { conversationId: 12, departmentId: 8 };
      expect(refreshForServerEvent('conversation:routed', payload, view({}, teamFive))).toBe(
        'list'
      );
      const incoming = [row(40, { latestIncomingMessage: { id: 12 } as never })];
      expect(
        refreshForServerEvent('conv:status_changed', payload, view({ rows: incoming }, teamFive))
      ).toBe('list');
    });
    it('no team filter, or a payload without a team or a thread: the list', () => {
      const payload = { conversationId: 99, departmentId: 8 };
      expect(refreshForServerEvent('conversation:routed', payload, view())).toBe('list');
      expect(
        refreshForServerEvent(
          'conversation:routed',
          payload,
          view({}, { departmentId: 'needs_routing' })
        )
      ).toBe('list');
      expect(
        refreshForServerEvent(
          'conv:status_changed',
          { conversationId: 99, departmentId: null },
          view({}, teamFive)
        )
      ).toBe('list');
      expect(
        refreshForServerEvent('conversation:routed', { departmentId: 8 }, view({}, teamFive))
      ).toBe('list');
    });
  });

  it('conversation:updated and message:replied always re-read the list (no team; one id for a bulk run)', () => {
    const payload = { conversationId: 99, departmentId: 8, action: 'bulk_resolve' };
    expect(refreshForServerEvent('conversation:updated', payload, view({}, teamFive))).toBe('list');
    expect(refreshForServerEvent('message:replied', { messageId: 99 }, view({}, teamFive))).toBe(
      'list'
    );
  });

  it('a later page, the board and contacts always re-read', () => {
    const payload = { conversationId: 99, departmentId: 8 };
    expect(refreshForServerEvent('conversation:routed', payload, view({ page: 2 }, teamFive))).toBe(
      'list'
    );
    expect(
      refreshForServerEvent(
        'conversation:routed',
        payload,
        view({ displayMode: 'kanban' }, teamFive)
      )
    ).toBe('list');
    expect(refreshForServerEvent('ticket:updated', {}, view({ displayMode: 'contacts' }))).toBe(
      'list'
    );
  });
});
