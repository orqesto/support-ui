/**
 * "New ticket" on the Tickets page (client spec "create a contingency"; owner 2026-10-19: an empty
 * contingency is allowed): title, cause, owner and department, with the threads it explains — or
 * none. It is created with no thread and the chosen ones are linked, then the ticket opens — saying
 * so when the threads could not be linked. The owner offered and sent is always one of the current
 * department's assignable people, read before Create is allowed.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { chooseOption, listOptions } from '@/test/chooseOption';

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
const assignable = vi.fn<(departmentId: number) => Promise<unknown[]>>();
vi.mock('@/services/assignment.service', () => ({
  assignmentService: {
    getAssignableUsers: (_user: unknown, departmentId: number) => assignable(departmentId),
  },
}));

vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 3, name: 'Shipping', active: true },
      { id: 4, name: 'Billing', active: true },
    ],
  }),
}));
const SUPPORT = { id: 7, role: 'user', organizationRole: 'support', departmentIds: [3] };
const auth: { user: Record<string, unknown> } = { user: SUPPORT };
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ user: auth.user }),
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
    auth.user = SUPPORT;
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

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42, { threadsFailed: false }));
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
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42, { threadsFailed: false }));
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
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42, { threadsFailed: false }));
    expect(create.mock.calls[0][0]).not.toHaveProperty('assigneeId');
  });

  it('only people in the department are offered as owner (the roster flags the others)', async () => {
    assignable.mockResolvedValue([
      { id: 7, firstName: 'Sam', lastName: 'Agent', email: 'sam@example.com', eligible: true },
      { id: 8, firstName: 'Bo', lastName: 'Other', email: 'bo@example.com', eligible: false },
    ]);
    renderDialog();
    await waitFor(() => expect(assignable).toHaveBeenCalledWith(3));
    await waitFor(async () =>
      expect(await listOptions(screen.getByRole('combobox', { name: 'Owner' }))).toEqual([
        'Unassigned',
        'Sam Agent',
      ])
    );
  });

  it('a creator outside the department (listed, not eligible) leaves it unassigned', async () => {
    const user = userEvent.setup();
    assignable.mockResolvedValue([
      { id: 7, firstName: 'Sam', lastName: 'Agent', email: 'sam@example.com', eligible: false },
      { id: 8, firstName: 'Bo', lastName: 'Agent', email: 'bo@example.com', eligible: true },
    ]);
    const onCreated = renderDialog();
    await fill(user);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42, { threadsFailed: false }));
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

  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('Title'), 'Carrier outage');
    await user.type(screen.getByLabelText('Cause'), 'Expected delays.');
  };

  it('threads that could not be linked: the ticket opens and its page is told so', async () => {
    const user = userEvent.setup();
    addThreads.mockRejectedValue(new Error('500'));
    const Opened = () => <p>opened {JSON.stringify(useLocation().state)}</p>;
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<NewTicketButton />} />
          <Route path="/tickets/:id" element={<Opened />} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'New ticket' }));
    await fill(user);
    await user.click(await screen.findByRole('button', { name: 'Add bob@example.com' }));
    await user.click(screen.getByRole('button', { name: 'Create with 1 thread' }));
    expect(await screen.findByText('opened {"threadsNotLinked":true}')).toBeInTheDocument();
    expect(addThreads).toHaveBeenCalledWith(42, [12]);
  });

  it('Create waits for the owner list: the creator is not sent before it shows they can own it', async () => {
    const user = userEvent.setup();
    let answer: (rows: unknown[]) => void = () => {};
    assignable.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const onCreated = renderDialog();
    await fill(user);
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(create).not.toHaveBeenCalled();

    // The list arrives without the creator (a global admin is not assignable).
    answer([{ id: 8, firstName: 'Bo', lastName: 'Agent', email: 'bo@example.com', role: 'user' }]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).not.toHaveProperty('assigneeId');
  });

  it('another department: the previous one’s people are no longer offered', async () => {
    auth.user = { id: 1, role: 'admin', organizationRole: null, departmentIds: [] };
    let billing: (rows: unknown[]) => void = () => {};
    assignable.mockImplementation((departmentId) =>
      departmentId === 3
        ? Promise.resolve([
            { id: 9, firstName: 'Kim', lastName: 'Agent', email: 'kim@example.com', role: 'user' },
          ])
        : new Promise((resolve) => (billing = resolve))
    );
    renderDialog();
    const owner = () => screen.getByRole('combobox', { name: 'Owner' });
    await waitFor(() => expect(assignable).toHaveBeenCalledWith(3));
    await chooseOption(owner(), 'Kim Agent');
    await chooseOption(screen.getByRole('combobox', { name: 'Department' }), 'Billing');
    await waitFor(() => expect(assignable).toHaveBeenCalledWith(4));

    expect(await listOptions(owner())).toEqual(['Unassigned']);
    fireEvent.keyDown(owner(), { key: 'Escape' });
    billing([{ id: 10, firstName: 'Lee', lastName: 'Agent', email: 'lee@example.com' }]);
    await waitFor(async () =>
      expect(await listOptions(owner())).toEqual(['Unassigned', 'Lee Agent'])
    );
  });

  it('an owner list that fails to load: created unassigned, not for an unchecked owner', async () => {
    const user = userEvent.setup();
    assignable.mockRejectedValue(new Error('500'));
    const onCreated = renderDialog();
    await fill(user);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).not.toHaveProperty('assigneeId');
  });
});
