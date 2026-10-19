/**
 * Renaming a ticket on its full page shows the new title once saved (staging 2026-10-19: the save
 * went through but the page kept the old title — the page passed no `onRefresh`, and closing the
 * editor re-synced the title from the ticket it still held). A failed save shows the old title.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Ticket } from '@/types';

const server: { ticket: Ticket } = {
  ticket: {
    id: 42,
    title: 'Parcel stuck',
    description: '',
    sender: 'a@example.com',
    status: 'open',
    priority: 'medium',
    categoryId: null,
    assigneeId: null,
    externalId: null,
    externalUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
};
const update = vi.fn<(id: number, patch: Partial<Ticket>) => Promise<void>>();
const getById = vi.fn(() => Promise.resolve({ success: true, data: { ...server.ticket } }));

vi.mock('@/services/ticket.service', () => ({
  ticketService: {
    getById: () => getById(),
    update: (id: number, patch: Partial<Ticket>) => update(id, patch),
  },
}));
vi.mock('@/services/settings.service', () => ({
  labelService: {
    getTicketLabels: () => Promise.resolve([]),
    getLabels: () => Promise.resolve([]),
  },
}));
vi.mock('@/services/category.service', () => ({
  categoryService: { getAll: () => Promise.resolve({ success: true, data: [] }) },
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getAll: () => Promise.resolve({ data: [] }) },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {}, info: () => {} } }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/ScrollButtons', () => ({ ScrollButtons: () => null }));
vi.mock('@/components/admin/AssignmentSelect', () => ({ AssignmentSelect: () => null }));
vi.mock('@/components/shared/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('@/components/tickets/MoveDepartmentDialog', () => ({ MoveDepartmentDialog: () => null }));
vi.mock('@/components/tickets/TicketPanelTabs', () => ({ TicketPanelTabs: () => null }));

import { TicketDetailPage } from '../TicketDetailPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/tickets/42']}>
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const rename = async (title: string) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Rename ticket' }));
  const input = screen.getByRole('textbox', { name: 'Ticket title' });
  fireEvent.change(input, { target: { value: title } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('TicketDetailPage — rename', () => {
  beforeEach(() => {
    server.ticket = { ...server.ticket, title: 'Parcel stuck' };
    update.mockImplementation((_id, patch) => {
      server.ticket = { ...server.ticket, ...patch };
      return Promise.resolve();
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the new title once saved', async () => {
    renderPage();
    await rename('Parcel stuck — carrier delay');

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(42, { title: 'Parcel stuck — carrier delay' })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Parcel stuck — carrier delay' })
      ).toBeInTheDocument()
    );
    // Loaded once, then reloaded once after the save.
    expect(getById).toHaveBeenCalledTimes(2);
    // And it stays: nothing re-syncs it back.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      screen.getByRole('heading', { name: 'Parcel stuck — carrier delay' })
    ).toBeInTheDocument();
  });

  it('a failed save shows the old title', async () => {
    update.mockRejectedValue(new Error('500'));
    renderPage();
    await rename('Parcel stuck — carrier delay');

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Parcel stuck' })).toBeInTheDocument()
    );
    expect(screen.queryByRole('heading', { name: 'Parcel stuck — carrier delay' })).toBeNull();
  });
});
