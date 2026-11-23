/**
 * A website visitor who left no email, on the pages that name a thread's or a record's customer —
 * Needs Routing, Deleted threads and the customer records page: "Website visitor (no email)"
 * (or "no email" under a name), never the placeholder the backend stores. The real pages; only
 * the app frame and their data are supplied.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const data = vi.hoisted(() => ({
  senders: [] as string[],
  contact: null as null | { id: number; displayName: string | null; primaryEmail: string },
}));
const rows = () =>
  data.senders.map((sender, index) => ({
    id: 70 + index,
    subject: `Thread ${index}`,
    sender,
    channel: 'chat',
    departmentId: null,
    deletedAt: '2026-10-15T10:00:00Z',
    createdAt: '2026-10-14T10:00:00Z',
    metadata: {},
  }));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) =>
      Promise.resolve(
        url.startsWith('/api/messages/deleted')
          ? { data: { data: { messages: rows(), count: rows().length, limit: 25, offset: 0 } } }
          : { data: { success: true, data: rows(), pagination: { total: rows().length } } }
      ),
  },
}));
vi.mock('@/services/message.service', () => ({ messageService: {} }));
vi.mock('@/services/contact.service', () => ({
  contactService: { getById: () => Promise.resolve(data.contact) },
}));
vi.mock('@/features/custom-api/services/customApiLookup.service', () => ({
  customApiLookupService: {
    storedRecords: () => Promise.resolve([]),
    lookupOptions: () => Promise.resolve([]),
    run: vi.fn(),
  },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/routing/RoutingBarScorecard', () => ({ RoutingBarScorecard: () => null }));
vi.mock('@/components/shared/MessageSourceFilter', () => ({
  ALL_SOURCES: 'all',
  MessageSourceFilter: () => null,
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 3, name: 'Support', active: true }] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { NeedsRoutingPage } from '../NeedsRoutingPage';
import { DeletedMessages } from '../DeletedMessagesPage';
import { CustomerRecordsPage } from '../CustomerRecordsPage';

const PLACEHOLDER = 'anonymous@chat-widget.local';
const LABEL = 'Website visitor (no email)';
const noPlaceholder = () => expect(document.body.innerHTML).not.toContain('chat-widget.local');

const show = (page: React.ReactNode, path = '/') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={page} />
          <Route path="/contacts/:id/records" element={page} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

afterEach(cleanup);

describe('Needs Routing', () => {
  it('names the visitor in the table and on the cards; keeps a visitor name', async () => {
    data.senders = [PLACEHOLDER, `Dana <${PLACEHOLDER}>`];
    show(<NeedsRoutingPage />);
    // The table row and the phone card are both in the document (shown by breakpoint).
    expect((await screen.findAllByText(LABEL)).length).toBe(2);
    expect(screen.getAllByText('Dana (no email)').length).toBe(2);
    noPlaceholder();
  });

  it('CONTROL: a real address is shown', async () => {
    data.senders = ['ada@example.com'];
    show(<NeedsRoutingPage />);
    expect((await screen.findAllByText('ada@example.com')).length).toBe(2);
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});

describe('Deleted threads', () => {
  it('names the visitor', async () => {
    data.senders = [PLACEHOLDER];
    show(<DeletedMessages />);
    expect(await screen.findByText(LABEL)).toBeInTheDocument();
    noPlaceholder();
  });

  it('CONTROL: a real address is shown', async () => {
    data.senders = ['ada@example.com'];
    show(<DeletedMessages />);
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
  });
});

describe('the customer records page', () => {
  it('is headed by the label when the record has no name', async () => {
    data.contact = { id: 5, displayName: null, primaryEmail: PLACEHOLDER };
    show(<CustomerRecordsPage />, '/contacts/5/records');
    expect(await screen.findByRole('heading', { name: LABEL })).toBeInTheDocument();
    noPlaceholder();
  });

  it('keeps a name, with "no email" where the address would be', async () => {
    data.contact = { id: 5, displayName: 'Dana', primaryEmail: PLACEHOLDER };
    show(<CustomerRecordsPage />, '/contacts/5/records');
    expect(await screen.findByRole('heading', { name: 'Dana' })).toBeInTheDocument();
    expect(screen.getByText('no email')).toBeInTheDocument();
    noPlaceholder();
  });

  it('CONTROL: a customer with an email shows it under the name', async () => {
    data.contact = { id: 5, displayName: 'Ada', primaryEmail: 'ada@example.com' };
    show(<CustomerRecordsPage />, '/contacts/5/records');
    expect(await screen.findByRole('heading', { name: 'Ada' })).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });
});
