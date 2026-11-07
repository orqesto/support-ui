/**
 * "Headers" on a thread message: the stored original headers, read-only, admins only.
 *
 * The backend refuses non-admins too (403); these assert the console never offers it to them and
 * fetches nothing until an admin opens it.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MessageEvent } from '@/types';

const permissions = { isAdmin: false, isOrgAdmin: false };
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => permissions }));

const fetched: number[] = [];
vi.mock('@/services/message-html.service', () => ({
  getMessageHeaders: (eventId: number) => {
    fetched.push(eventId);
    return Promise.resolve({
      source: 'gmail',
      headers: [
        { name: 'Received', value: 'from relay.example.test' },
        { name: 'Auto-Submitted', value: 'auto-generated' },
      ],
      truncated: false,
    });
  },
  getMessageHtml: () => Promise.resolve(null),
}));
vi.mock('@/hooks/useMessageHtml', () => ({
  useMessageHtml: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));

const { OriginalHeadersButton } = await import('../OriginalHeadersButton');
const { ThreadMessageItem } = await import('../ThreadMessageItem');

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const message = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 77,
    conversationId: 10,
    type: 'agent_reply',
    content: 'Thank you for reaching out',
    authorEmail: 'info@example.test',
    channel: 'email',
    createdAt: '2026-08-18T17:50:00Z',
    metadata: null,
    recipients: null,
    ...over,
  }) as unknown as MessageEvent;

beforeEach(() => {
  permissions.isAdmin = false;
  permissions.isOrgAdmin = false;
});
afterEach(() => {
  cleanup();
  fetched.length = 0;
});

describe('OriginalHeadersButton', () => {
  it('is not offered to an agent who is not an admin, and fetches nothing', () => {
    wrap(<OriginalHeadersButton eventId={77} />);
    expect(screen.queryByTestId('original-headers-button')).toBeNull();
    expect(fetched).toEqual([]);
  });

  it('a workspace admin opens a read-only list of the headers, in order', async () => {
    permissions.isOrgAdmin = true;
    wrap(<OriginalHeadersButton eventId={77} />);
    expect(fetched).toEqual([]); // nothing until it is opened
    fireEvent.click(screen.getByTestId('original-headers-button'));
    const list = await screen.findByTestId('original-headers');
    expect(fetched).toEqual([77]);
    const lines = Array.from(list.querySelectorAll('li')).map((line) => line.textContent);
    expect(lines).toEqual(['Received: from relay.example.test', 'Auto-Submitted: auto-generated']);
    expect(list.querySelector('input, textarea')).toBeNull(); // read-only
  });

  it('a global admin is offered it too', () => {
    permissions.isAdmin = true;
    wrap(<OriginalHeadersButton eventId={77} />);
    expect(screen.getByTestId('original-headers-button')).toBeTruthy();
  });
});

describe('ThreadMessageItem shows it on both sides of the thread (admins)', () => {
  it.each(['agent_reply', 'inbound'] as const)('%s', (type) => {
    permissions.isOrgAdmin = true;
    wrap(<ThreadMessageItem msg={message({ type })} />);
    expect(screen.getByTestId('original-headers-button')).toBeTruthy();
  });

  it('CONTROL: not for an agent', () => {
    wrap(<ThreadMessageItem msg={message({ type: 'inbound' })} />);
    expect(screen.queryByTestId('original-headers-button')).toBeNull();
  });
});
