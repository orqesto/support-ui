/**
 * A website visitor who left no email is named "Website visitor (no email)" wherever a thread's
 * customer is shown — the list row, the board card and the Customer tab — and never by the
 * placeholder the backend stores for them. A visitor's name is kept.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';
import type { Message } from '@/types';

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ABC' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));

import { KanbanCard } from '../KanbanCard';
import { MessageListItem } from '../MessageListItem';
import { CustomerSenderBlock } from '../CustomerTabPanels';

afterEach(cleanup);

const PLACEHOLDER = 'anonymous@chat-widget.local';
const LABEL = 'Website visitor (no email)';

const thread = (sender: string): MessageThread =>
  ({
    threadId: 'conv_7',
    publicId: 'SUP-7',
    sender,
    subject: 'Where is my parcel?',
    status: 'open',
    priority: 'medium',
    lastMessageAt: new Date().toISOString(),
    latestMessage: {
      id: 1,
      conversationId: 7,
      type: 'inbound',
      content: 'Where is my parcel?',
      channel: 'chat',
      createdAt: new Date().toISOString(),
      metadata: {},
    },
  }) as unknown as MessageThread;

const noPlaceholder = () => {
  expect(document.body.innerHTML).not.toContain('chat-widget.local');
  expect(document.body.innerHTML).not.toContain('mailto:');
};

describe('the list row', () => {
  const renderRow = (sender: string) =>
    render(
      <MemoryRouter>
        <MessageListItem
          thread={thread(sender)}
          onOpen={() => {}}
          selected={false}
          onToggleSelected={() => {}}
        />
      </MemoryRouter>
    );

  it('names the visitor, in the row and in its select box', () => {
    renderRow(PLACEHOLDER);
    expect(screen.getAllByText(LABEL).length).toBeGreaterThan(0);
    expect(screen.getByRole('checkbox', { name: `Select thread from ${LABEL}` })).toBeTruthy();
    noPlaceholder();
  });

  it('keeps a visitor name', () => {
    renderRow(`Dana <${PLACEHOLDER}>`);
    expect(screen.getAllByText('Dana').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('checkbox', { name: 'Select thread from Dana (no email)' })
    ).toBeTruthy();
    noPlaceholder();
  });

  it('CONTROL: a real address is shown', () => {
    renderRow('ada@shop.example');
    expect(screen.getAllByText('ada@shop.example').length).toBeGreaterThan(0);
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});

describe('the board card', () => {
  it('names the visitor, in the card and in its accessible name', () => {
    render(<KanbanCard thread={thread(PLACEHOLDER)} onOpen={() => {}} />);
    expect(screen.getByText(LABEL)).toBeTruthy();
    expect(screen.getByLabelText(`Open thread from ${LABEL}`, { exact: false })).toBeTruthy();
    noPlaceholder();
  });

  it('CONTROL: a real address is shown', () => {
    render(<KanbanCard thread={thread('ada@shop.example')} onOpen={() => {}} />);
    expect(screen.getByText('ada@shop.example')).toBeTruthy();
  });
});

describe('the Customer tab', () => {
  const message = (sender: string) => ({ sender, channel: 'chat' }) as unknown as Message;

  it('names the visitor', () => {
    render(<CustomerSenderBlock message={message(PLACEHOLDER)} />);
    expect(screen.getByText(LABEL)).toBeTruthy();
    noPlaceholder();
  });

  it('keeps a visitor name, with "no email" where the address would be', () => {
    render(<CustomerSenderBlock message={message(`Dana <${PLACEHOLDER}>`)} />);
    expect(screen.getByText('Dana')).toBeTruthy();
    expect(screen.getByTestId('customer-sender').textContent).toContain('no email');
    noPlaceholder();
  });

  it('CONTROL: a real customer keeps name and address', () => {
    render(<CustomerSenderBlock message={message('Ada <ada@shop.example>')} />);
    expect(screen.getByTestId('customer-sender').textContent).toContain('ada@shop.example');
  });
});
