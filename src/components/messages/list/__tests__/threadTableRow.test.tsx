import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';

/**
 * The thread table row (Messages list v4), as checked on staging 2026-10-23:
 * - a suspicious or spam thread is still open/resolved/… — its status shows, as on the card,
 *   instead of the dash meant for not-analysed and archived mail;
 * - the From column is the sender's name, not the whole `Name <addr>` line.
 */

vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));

import { MessageListItem } from '../../MessageListItem';

afterEach(cleanup);

const row = (over: { status: string; sender?: string; metadata?: Record<string, unknown> }) =>
  ({
    threadId: 'conv_7',
    publicId: 'TRA-SUP-7',
    sender: over.sender ?? 'Ada Lovelace <ada@shop.example>',
    subject: 'Refund?',
    status: over.status,
    priority: 'medium',
    lastMessageAt: new Date().toISOString(),
    latestMessage: {
      id: 1,
      conversationId: 7,
      type: 'inbound',
      status: over.status,
      content: 'Where is my refund?',
      channel: 'email',
      createdAt: new Date().toISOString(),
      metadata: over.metadata ?? {},
    },
  }) as unknown as MessageThread;

const renderRow = (thread: MessageThread, density: 'compact' | 'comfortable' = 'compact') =>
  render(
    <MemoryRouter>
      <MessageListItem thread={thread} onOpen={() => {}} density={density} />
    </MemoryRouter>
  );

describe('thread table row', () => {
  it('shows the status of a suspicious thread', () => {
    renderRow(
      row({ status: 'resolved', metadata: { spamCheck: { category: 'suspicious' } } })
    );
    expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0);
    expect(screen.queryByText('—')).toBeNull();
  });

  it('the open row drops its plain spine so the current-row marker shows', () => {
    render(
      <MemoryRouter>
        <MessageListItem
          thread={row({ status: 'open', metadata: {} })}
          onOpen={() => {}}
          density="compact"
          current
        />
      </MemoryRouter>
    );
    // An open thread with no warning: its blue spine yields to the current-row marker.
    expect(document.querySelector('span[aria-hidden="true"].w-\\[3px\\]')).toBeNull();
  });

  it('keeps the dash for not-analysed mail, which has no status', () => {
    renderRow(row({ status: 'filtered' }));
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('names the sender without the address in the table', () => {
    renderRow(row({ status: 'open' }));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText(/ada@shop\.example/)).toBeNull();
  });

  it('shows a bare address as itself', () => {
    renderRow(row({ status: 'open', sender: 'ada@shop.example' }));
    expect(screen.getByText('ada@shop.example')).toBeInTheDocument();
  });

  it('shows an address once when the name is the address', () => {
    renderRow(row({ status: 'open', sender: 'ada@shop.example <ada@shop.example>' }));
    expect(screen.getByText('ada@shop.example')).toBeInTheDocument();
  });

  it('names the sender without the address on the card too', () => {
    renderRow(row({ status: 'open' }), 'comfortable');
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText(/<ada@shop\.example>/)).toBeNull();
  });
});
