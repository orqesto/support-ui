/**
 * "New ticket" on the Tickets page (client spec "create a contingency"; owner 2026-10-19: an empty
 * contingency is allowed): title, cause, owner and department, with the threads it explains — or
 * none. It is created with no thread and the chosen ones are linked, then the ticket opens.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { listOptions } from '@/test/chooseOption';

const create = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const addThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const perms = { create: true };

vi.mock('@/services/ticket.service', () => ({
  ticketService: { create: (...args: unknown[]) => create(...args) },
}));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { addThreads: (...args: unknown[]) => addThreads(...args) },
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: (...args: unknown[]) => getThreads(...args) },
}));
const assignable = vi.fn<() => Promise<unknown[]>>();
vi.mock('@/services/assignment.service', () => ({
  assignmentService: { getAssignableUsers: () => assignable() },
}));

vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 3, name: 'Shipping', active: true },
      { id: 4, name: 'Billing', active: true },
    ],
  }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: { id: 7, role: 'user', organizationRole: 'support', departmentIds: [3] } }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => perms.create }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {}, info: () => {} } }));

import { NewTicketButton } from '../NewTicketButton';
import { NewTicketDialog } from '../NewTicketDialog';

const thread = (id: number, sender: string, subject: string) => ({
  sender,
  latestMessage: { id, publicId: `SHP-${id}`, subject, sender },
});

describe('New ticket', () => {
  beforeEach(() => {
    perms.create = true;
    getThreads.mockResolvedValue({
      data: [
        thread(11, 'ada@example.com', 'Parcel held'),
        thread(12, 'bob@example.com', 'Papers missing'),
      ],
    });
    create.mockResolvedValue({ success: true, data: { id: 42 } });
    assignable.mockResolvedValue([
      { id: 7, firstName: 'Sam', lastName: 'Agent', email: 'sam@example.com', role: 'user' },
    ]);
    addThreads.mockResolvedValue({ added: [12], alreadyAttached: [] });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderDialog = (onCreated = vi.fn()) => {
    render(
      <MemoryRouter>
        <NewTicketDialog open onOpenChange={() => {}} onCreated={onCreated} />
      </MemoryRouter>
    );
    return onCreated;
  };

  it('creates it with no thread in the creator’s department, links the chosen threads, then opens it', async () => {
    const user = userEvent.setup();
    const onCreated = renderDialog();
    const createButton = screen.getByRole('button', { name: 'Create' });
    // A title and a cause are needed.
    expect(createButton).toBeDisabled();
    await user.type(screen.getByLabelText('Title'), 'Customs papers lost');
    await user.type(screen.getByLabelText('Cause'), 'The carrier lost the papers.');
    await user.click(await screen.findByRole('button', { name: 'Add bob@example.com' }));
    await user.click(screen.getByRole('button', { name: 'Create with 1 thread' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42));
    const [body] = create.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({ title: 'Customs papers lost', departmentId: 3, assigneeId: 7 });
    expect(body).not.toHaveProperty('messageId');
    expect(body.description).toContain('The carrier lost the papers.');
    expect(addThreads).toHaveBeenCalledWith(42, [12]);
  });

  it('an empty one: created with no threads, nothing is linked', async () => {
    const user = userEvent.setup();
    const onCreated = renderDialog();
    await user.type(screen.getByLabelText('Title'), 'Carrier outage');
    await user.type(screen.getByLabelText('Cause'), 'Expected delays.');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42));
    expect(addThreads).not.toHaveBeenCalled();
  });

  it('a creator who cannot own a ticket here (not listed) leaves it unassigned', async () => {
    const user = userEvent.setup();
    assignable.mockResolvedValue([
      { id: 8, firstName: 'Bo', lastName: 'Agent', email: 'bo@example.com', role: 'user' },
    ]);
    const onCreated = renderDialog();
    await user.type(screen.getByLabelText('Title'), 'Carrier outage');
    await user.type(screen.getByLabelText('Cause'), 'Expected delays.');
    await waitFor(() => expect(assignable).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42));
    expect(create.mock.calls[0][0]).not.toHaveProperty('assigneeId');
  });

  it('only the creator’s departments are offered', async () => {
    renderDialog();
    expect(await listOptions(screen.getByRole('combobox', { name: 'Department' }))).toEqual([
      'Shipping',
    ]);
  });

  it('a refused create says why and opens nothing', async () => {
    const user = userEvent.setup();
    create.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: 'You do not have access to this department' } },
    });
    const onCreated = renderDialog();
    await user.type(screen.getByLabelText('Title'), 'Carrier outage');
    await user.type(screen.getByLabelText('Cause'), 'Expected delays.');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText(/could not be created|do not have access/)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('the button is there only for a role that may create tickets', () => {
    const { unmount } = render(
      <MemoryRouter>
        <NewTicketButton />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'New ticket' })).toBeInTheDocument();
    unmount();

    perms.create = false;
    render(
      <MemoryRouter>
        <NewTicketButton />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'New ticket' })).toBeNull();
  });
});
