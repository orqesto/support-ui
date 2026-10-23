import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread, SearchMatch } from '@/services/message.service';

/**
 * A searched list row marks the typed words, and a thread found only inside a message quotes
 * that passage instead of the latest message's preview.
 */

vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));

import { MessageListItem } from '../MessageListItem';

afterEach(cleanup);

const row = (searchMatch?: SearchMatch | null): MessageThread =>
  ({
    threadId: 'conv_7',
    sender: 'anna@shop.example',
    subject: 'Refund for the parcel',
    lastMessageAt: new Date().toISOString(),
    searchMatch,
    latestMessage: {
      id: 1,
      conversationId: 7,
      type: 'inbound',
      subject: 'Refund for the parcel',
      content: '<p>Latest message text</p>',
      channel: 'email',
      status: 'open',
      createdAt: new Date().toISOString(),
    },
  }) as unknown as MessageThread;

const renderRow = (thread: MessageThread, terms?: string[]) =>
  render(
    <MemoryRouter>
      <MessageListItem thread={thread} onOpen={() => {}} highlightTerms={terms} />
    </MemoryRouter>
  );

const marks = (container: HTMLElement) =>
  [...container.querySelectorAll('mark')].map((mark) => mark.textContent);

describe('MessageListItem — search match', () => {
  it('quotes the body passage in place of the preview, words marked', () => {
    const { container } = renderRow(
      row({ field: 'body', snippet: '…the courier left it <b>outside</b> the door' }),
      ['courier']
    );
    expect(container.textContent).toContain('…the courier left it <b>outside</b> the door');
    expect(container.textContent).not.toContain('Latest message text');
    expect(container.querySelector('b')).toBeNull();
    expect(marks(container)).toEqual(['courier']);
  });

  it('quotes a note passage, labelled, words marked anywhere — as the backend matched them', () => {
    const { container } = renderRow(
      row({ field: 'note', snippet: 'Called back: the reorder ships Friday' }),
      ['order']
    );
    expect(container.textContent).toContain('Note: Called back: the reorder ships Friday');
    expect(container.textContent).not.toContain('Latest message text');
    expect(marks(container)).toEqual(['order']);
  });

  it('a note match without a passage keeps the plain preview, unlabelled (control)', () => {
    const { container } = renderRow(row({ field: 'note' }), ['order']);
    expect(container.textContent).toContain('Latest message text');
    expect(container.textContent).not.toContain('Note:');
  });

  it('marks the words in the subject and the sender', () => {
    const { container } = renderRow(row({ field: 'subject' }), ['parcel', 'shop']);
    expect(marks(container)).toEqual(expect.arrayContaining(['parcel', 'shop']));
    expect(container.textContent).toContain('Latest message text');
  });

  it('shows the plain row with no search, or from a backend without the field (control)', () => {
    for (const thread of [row(null), row(undefined)]) {
      const { container, unmount } = renderRow(thread);
      expect(container.querySelector('mark')).toBeNull();
      expect(container.textContent).toContain('Latest message text');
      unmount();
    }
  });
});
