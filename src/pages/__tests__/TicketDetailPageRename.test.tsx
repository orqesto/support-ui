/**
 * Renaming a ticket on its full page shows the new title once saved (staging 2026-10-19: the save
 * went through but the page kept the old title — the page passed no `onRefresh`, and closing the
 * editor re-synced the title from the ticket it still held). A failed save shows the old title.
 * Delete follows the route's permission; a new ticket whose threads failed to link says so.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

vi.mock('@/hooks/useTeamsEnabled', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // These tests are about the team row itself: the workspace uses teams.
  useTeamsEnabled: () => true,
  deriveTeamsEnabled: () => true,
}));
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
// The permissions the signed-in role holds — answered per permission, as the real hook does.
const perms: { held: string[] } = { held: [] };
const ADMIN = ['manage_tickets', 'delete_tickets', 'manage_organization'];
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) => perms.held.includes(permission),
    hasAnyPermission: (permissions: string[]) =>
      permissions.some((permission) => perms.held.includes(permission)),
  }),
}));
// The sidebar names the ticket's department from the cached list; no query client here.
vi.mock('@/hooks/useDepartments', () => ({ useDepartmentById: () => undefined }));
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

const renderPage = (state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/tickets/42', state }]}>
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
    perms.held = ADMIN;
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

  // Delete lives in the ticket's ⋯ menu (Tickets v3).
  const deleteOffered = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    return screen.queryByRole('menuitem', { name: 'Delete ticket…' });
  };

  it('Delete is offered only to a role the route lets delete (DELETE_TICKETS or MANAGE_ORGANIZATION)', async () => {
    renderPage();
    expect(await deleteOffered()).toBeInTheDocument();
    cleanup();

    // Support and moderators manage tickets but may not delete them (the server answers 403).
    perms.held = ['manage_tickets'];
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Parcel stuck' })).toBeInTheDocument();
    expect(await deleteOffered()).toBeNull();
    cleanup();

    // An associate (staging 2026-10-19: saw Delete, which the server refuses).
    perms.held = [];
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Parcel stuck' })).toBeInTheDocument();
    expect(await deleteOffered()).toBeNull();
  });

  it('opened by New ticket after its threads failed to link: says so, and only then', async () => {
    renderPage({ threadsNotLinked: true });
    expect(
      await screen.findByText(/The ticket was created, but its threads could not be linked/)
    ).toBeInTheDocument();
    cleanup();

    renderPage();
    expect(await screen.findByRole('heading', { name: 'Parcel stuck' })).toBeInTheDocument();
    expect(screen.queryByText(/its threads could not be linked/)).toBeNull();
  });

  it('the notice is dropped from the history entry once read, so a reload or Back does not bring it back', async () => {
    let seen: unknown = 'unread';
    const Probe = () => {
      seen = useLocation().state;
      return null;
    };
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/tickets/42', state: { threadsNotLinked: true } }]}
      >
        <Routes>
          <Route
            path="/tickets/:id"
            element={
              <>
                <TicketDetailPage />
                <Probe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(
      await screen.findByText(/The ticket was created, but its threads could not be linked/)
    ).toBeInTheDocument();
    await waitFor(() => expect(seen).toBeNull());
    // Still shown for this visit.
    expect(screen.getByText(/its threads could not be linked/)).toBeInTheDocument();
  });
});
