/**
 * Create ticket — one page for both ways in (owner 2026-10-21; it replaced the New ticket dialog,
 * whose cases are carried over here):
 * - Tickets → New ticket: empty (an empty contingency is allowed, owner 2026-10-19) — title,
 *   cause, one of the creator's departments, an owner who can own it there, and the threads it
 *   explains or none; created with no thread, the chosen ones linked after;
 * - a thread → Create ticket: that thread listed, its department shown, others can be added.
 * Created as JSON, the files uploaded to the ticket after (POST /api/tickets reads no multipart
 * body). A step that fails after the ticket exists opens it, and its page is told what is missing.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { chooseOption, listOptions } from '@/test/chooseOption';

const create = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const uploadAttachments = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const addThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getById = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const assignable = vi.fn<(departmentId: number | undefined) => Promise<unknown[]>>();
const perms = { create: true };
const empty = () =>
  new Proxy({}, { get: () => () => Promise.resolve({ success: true, data: [] }) });

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
    <textarea
      data-testid="description"
      value={content}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
/** Set ⇒ POST /api/ai/enhance-ticket is refused with this (an apiError). */
let enhanceRefusal: Error | null = null;
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    {
      get: (_target, key) => (url: unknown) =>
        key === 'post' && String(url).includes('enhance-ticket') && enhanceRefusal
          ? Promise.reject(enhanceRefusal)
          : Promise.resolve({ success: true, data: [] }),
    }
  ),
}));
vi.mock('@/services/category.service', () => ({ categoryService: empty() }));
const integrations: { list: unknown[] } = { list: [] };
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () => Promise.resolve({ success: true, data: integrations.list }),
  },
}));
vi.mock('@/services/settings.service', () => ({ settingsService: empty() }));
vi.mock('@/services/ticket.service', () => ({
  ticketService: {
    create: (...args: unknown[]) => create(...args),
    uploadAttachments: (...args: unknown[]) => uploadAttachments(...args),
  },
}));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { addThreads: (...args: unknown[]) => addThreads(...args) },
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getThreads: (...args: unknown[]) => getThreads(...args),
    getById: (...args: unknown[]) => getById(...args),
    getThreadMessages: () => Promise.resolve({ success: true, data: [] }),
  },
}));
vi.mock('@/services/assignment.service', () => ({
  assignmentService: {
    getAssignableUsers: (_skill: unknown, departmentId?: number) => assignable(departmentId),
  },
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 3, name: 'Shipping', active: true },
      { id: 4, name: 'Billing', active: true },
    ],
    isFetched: true,
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
vi.mock('@/lib/logger', () => ({
  logger: { error: () => {}, info: () => {}, warn: () => {}, debug: () => {} },
}));

const { CreateTicketPage } = await import('@/pages/CreateTicketPage');
const { NewTicketButton } = await import('@/components/tickets/NewTicketButton');
const { ThemeProvider } = await import('@/contexts/ThemeContext');

const thread = (id: number, sender: string, subject: string) => ({
  sender,
  latestMessage: { id, publicId: `SHP-${id}`, subject, sender },
});

/** The ticket page, showing what Create handed it. */
const Opened = () => <p>opened {JSON.stringify(useLocation().state)}</p>;

const renderPage = (entry = '/tickets/create') =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/tickets/create" element={<CreateTicketPage />} />
          <Route path="/tickets/:id" element={<Opened />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );

const createButton = () => screen.getByRole('button', { name: 'Create ticket' });

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Title'), 'Carrier outage');
  await user.type(screen.getByTestId('description'), 'Expected delays.');
};

const createdBody = () => create.mock.calls[0][0] as Record<string, unknown>;

describe('Create ticket — one page for New ticket and a thread’s Create ticket', () => {
  beforeEach(() => {
    perms.create = true;
    auth.user = SUPPORT;
    integrations.list = [];
    getThreads.mockResolvedValue({
      data: [
        thread(11, 'ada@example.com', 'Parcel held'),
        thread(12, 'bob@example.com', 'Papers missing'),
      ],
    });
    getById.mockResolvedValue({
      success: true,
      data: {
        id: 11,
        publicId: 'SHP-11',
        subject: 'Re: Parcel held',
        sender: 'ada@example.com',
        channel: 'email',
        departmentId: 4,
        content: 'Where is my parcel?',
      },
    });
    create.mockResolvedValue({ success: true, data: { id: 42 } });
    uploadAttachments.mockResolvedValue(undefined);
    assignable.mockResolvedValue([
      { id: 7, firstName: 'Sam', lastName: 'Agent', email: 'sam@example.com', role: 'user' },
    ]);
    addThreads.mockResolvedValue({ added: [12], alreadyAttached: [] });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('opened empty (Tickets → New ticket)', () => {
    it('creates it with no thread in the creator’s team, links the chosen threads, then opens it', async () => {
      const user = userEvent.setup();
      renderPage();
      // A title and a cause are needed.
      expect(createButton()).toBeDisabled();
      await user.type(screen.getByLabelText('Title'), 'Customs papers lost');
      await user.type(screen.getByTestId('description'), 'The carrier lost the papers.');
      await user.click(await screen.findByRole('button', { name: 'Add bob@example.com' }));
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());

      expect(await screen.findByText('opened null', {}, { timeout: 3000 })).toBeInTheDocument();
      expect(createdBody()).toMatchObject({
        title: 'Customs papers lost',
        departmentId: 3,
        assigneeId: 7,
      });
      expect(createdBody()).not.toHaveProperty('messageId');
      expect(createdBody().description).toContain('The carrier lost the papers.');
      expect(addThreads).toHaveBeenCalledWith(42, [12]);
    });

    it('an empty one: created with no threads, nothing is linked', async () => {
      const user = userEvent.setup();
      renderPage();
      await fill(user);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(addThreads).not.toHaveBeenCalled();
    });

    it('a title alone is not enough: the cause is needed too', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.type(screen.getByLabelText('Title'), 'Carrier outage');
      await waitFor(() => expect(assignable).toHaveBeenCalled());
      expect(createButton()).toBeDisabled();
    });

    it('only the creator’s teams are offered', async () => {
      renderPage();
      expect(await listOptions(screen.getByRole('combobox', { name: 'Team' }))).toEqual([
        'Shipping',
      ]);
    });

    it('a creator who cannot own a ticket here (not listed) leaves it unassigned', async () => {
      const user = userEvent.setup();
      assignable.mockResolvedValue([
        { id: 8, firstName: 'Bo', lastName: 'Agent', email: 'bo@example.com', role: 'user' },
      ]);
      renderPage();
      await fill(user);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(createdBody()).not.toHaveProperty('assigneeId');
    });

    it('only people in the team are offered as owner (the roster flags the others)', async () => {
      assignable.mockResolvedValue([
        { id: 7, firstName: 'Sam', lastName: 'Agent', email: 'sam@example.com', eligible: true },
        { id: 8, firstName: 'Bo', lastName: 'Other', email: 'bo@example.com', eligible: false },
      ]);
      renderPage();
      await waitFor(() => expect(assignable).toHaveBeenCalledWith(3));
      await waitFor(async () =>
        expect(await listOptions(screen.getByRole('combobox', { name: 'Owner' }))).toEqual([
          'Unassigned',
          'Sam Agent',
        ])
      );
    });

    it('a creator outside the team (listed, not eligible) leaves it unassigned', async () => {
      const user = userEvent.setup();
      assignable.mockResolvedValue([
        { id: 7, firstName: 'Sam', lastName: 'Agent', email: 'sam@example.com', eligible: false },
        { id: 8, firstName: 'Bo', lastName: 'Agent', email: 'bo@example.com', eligible: true },
      ]);
      renderPage();
      await fill(user);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(createdBody()).not.toHaveProperty('assigneeId');
    });

    it('Create waits for the owner list: the creator is not sent before it shows they can own it', async () => {
      const user = userEvent.setup();
      let answer: (rows: unknown[]) => void = () => {};
      assignable.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderPage();
      await fill(user);
      expect(createButton()).toBeDisabled();
      expect(screen.getByText('Loading who can own it…')).toBeInTheDocument();

      // The list arrives without the creator (a global admin is not assignable).
      answer([
        { id: 8, firstName: 'Bo', lastName: 'Agent', email: 'bo@example.com', role: 'user' },
      ]);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(createdBody()).not.toHaveProperty('assigneeId');
    });

    it('another team: the previous one’s people are no longer offered', async () => {
      auth.user = { id: 1, role: 'admin', organizationRole: null, departmentIds: [] };
      let billing: (rows: unknown[]) => void = () => {};
      assignable.mockImplementation((departmentId) =>
        departmentId === 3
          ? Promise.resolve([
              {
                id: 9,
                firstName: 'Kim',
                lastName: 'Agent',
                email: 'kim@example.com',
                role: 'user',
              },
            ])
          : new Promise((resolve) => (billing = resolve))
      );
      renderPage();
      const owner = () => screen.getByRole('combobox', { name: 'Owner' });
      await waitFor(() => expect(assignable).toHaveBeenCalledWith(3));
      await waitFor(async () => expect(await listOptions(owner())).toContain('Kim Agent'));
      fireEvent.keyDown(owner(), { key: 'Escape' });
      await chooseOption(owner(), 'Kim Agent');
      await chooseOption(screen.getByRole('combobox', { name: 'Team' }), 'Billing');
      await waitFor(() => expect(assignable).toHaveBeenCalledWith(4));

      expect(await listOptions(owner())).toEqual(['Unassigned']);
      fireEvent.keyDown(owner(), { key: 'Escape' });
      billing([{ id: 10, firstName: 'Lee', lastName: 'Agent', email: 'lee@example.com' }]);
      await waitFor(async () =>
        expect(await listOptions(owner())).toEqual(['Unassigned', 'Lee Agent'])
      );
    });

    it('an owner list that never answers: after a while Create goes ahead unassigned', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        assignable.mockReturnValue(new Promise(() => {}));
        renderPage();
        await fill(user);
        expect(screen.getByText('Loading who can own it…')).toBeInTheDocument();
        expect(createButton()).toBeDisabled();
        vi.advanceTimersByTime(10_000);
        await waitFor(() => expect(createButton()).toBeEnabled());
        expect(screen.queryByText('Loading who can own it…')).toBeNull();
        await user.click(createButton());
        await waitFor(() => expect(create).toHaveBeenCalled());
        expect(createdBody()).not.toHaveProperty('assigneeId');
      } finally {
        vi.useRealTimers();
      }
    });

    it('an owner list that fails to load: created unassigned, not for an unchecked owner', async () => {
      const user = userEvent.setup();
      assignable.mockRejectedValue(new Error('500'));
      renderPage();
      await fill(user);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(createdBody()).not.toHaveProperty('assigneeId');
    });

    it('a refused create says why and opens nothing', async () => {
      const user = userEvent.setup();
      create.mockRejectedValue({
        isAxiosError: true,
        response: { status: 403, data: { error: 'You do not have access to this team' } },
      });
      renderPage();
      await fill(user);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      expect(
        await screen.findByText(/could not be created|do not have access/)
      ).toBeInTheDocument();
      expect(screen.queryByText(/^opened/)).toBeNull();
    });

    it('threads that could not be linked: the ticket opens and its page is told so', async () => {
      const user = userEvent.setup();
      addThreads.mockRejectedValue(new Error('500'));
      renderPage();
      await fill(user);
      await user.click(await screen.findByRole('button', { name: 'Add bob@example.com' }));
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      expect(
        await screen.findByText('opened {"threadsNotLinked":true}', {}, { timeout: 3000 })
      ).toBeInTheDocument();
      expect(addThreads).toHaveBeenCalledWith(42, [12]);
    });
  });

  describe('files', () => {
    const attach = async (user: ReturnType<typeof userEvent.setup>, container: HTMLElement) => {
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(input, new File(['papers'], 'papers.pdf', { type: 'application/pdf' }));
    };

    it('the ticket is created as JSON, then its files are uploaded to it', async () => {
      const user = userEvent.setup();
      const { container } = renderPage();
      await fill(user);
      await attach(user, container);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      expect(await screen.findByText('opened null', {}, { timeout: 3000 })).toBeInTheDocument();
      // No files ride on the create (the backend reads none there).
      expect(createdBody()).not.toBeInstanceOf(FormData);
      expect(uploadAttachments).toHaveBeenCalledTimes(1);
      const [ticketId, files] = uploadAttachments.mock.calls[0] as [number, File[]];
      expect(ticketId).toBe(42);
      expect(files.map((file) => file.name)).toEqual(['papers.pdf']);
    });

    it('CONTROL: no files, no upload', async () => {
      const user = userEvent.setup();
      renderPage();
      await fill(user);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(uploadAttachments).not.toHaveBeenCalled();
    });

    it('files that could not be uploaded: the ticket opens and its page is told so', async () => {
      const user = userEvent.setup();
      uploadAttachments.mockRejectedValue(new Error('403'));
      const { container } = renderPage();
      await fill(user);
      await attach(user, container);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      expect(
        await screen.findByText('opened {"filesNotAttached":true}', {}, { timeout: 3000 })
      ).toBeInTheDocument();
    });
  });

  describe('opened from a thread (a thread → Create ticket)', () => {
    it('lists that thread, shows its team, and is created from it — with another thread linked', async () => {
      const user = userEvent.setup();
      renderPage('/tickets/create?messageId=11');
      expect(
        await screen.findByText(/SHP-11 · ada@example\.com \(this thread\)/)
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Team')).toHaveValue('Billing');
      // The owner list is the thread's department's.
      await waitFor(() => expect(assignable).toHaveBeenCalledWith(4));
      // The thread itself is not offered again.
      expect(
        await screen.findByRole('button', { name: 'Add bob@example.com' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add ada@example.com' })).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Add bob@example.com' }));
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(createdBody()).toMatchObject({ messageId: 11, title: 'Parcel held' });
      expect(createdBody()).not.toHaveProperty('departmentId');
      expect(addThreads).toHaveBeenCalledWith(42, [12]);
    });

    it('a thread with no team: the whole roster is offered, as before', async () => {
      getById.mockResolvedValue({
        success: true,
        data: {
          id: 11,
          subject: 'Parcel held',
          sender: 'ada@example.com',
          departmentId: null,
          content: 'x',
        },
      });
      renderPage('/tickets/create?messageId=11');
      await waitFor(() => expect(screen.getByLabelText('Team')).toHaveValue('No team'));
      await waitFor(() => expect(assignable).toHaveBeenCalledWith(undefined));
    });
  });

  describe('the New ticket button', () => {
    it('is there only for a role that may create tickets', () => {
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

    it('opens the Create ticket page — no dialog', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<NewTicketButton />} />
            <Route path="/tickets/create" element={<p>create page</p>} />
          </Routes>
        </MemoryRouter>
      );
      await user.click(screen.getByRole('button', { name: 'New ticket' }));
      expect(screen.getByText('create page')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('review fixes (#675)', () => {
    it('no "Sync to Jira" on a ticket with no thread — the backend refuses it — and the flag is not sent', async () => {
      const user = userEvent.setup();
      integrations.list = [{ type: 'jira', enabled: true }];
      renderPage();
      await fill(user);
      await waitFor(() => expect(createButton()).toBeEnabled());
      expect(screen.queryByText('Sync to Jira')).toBeNull();
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(createdBody()).not.toHaveProperty('syncToJira');
    });

    it('CONTROL: from a thread, "Sync to Jira" is offered and sent', async () => {
      const user = userEvent.setup();
      integrations.list = [{ type: 'jira', enabled: true }];
      renderPage('/tickets/create?messageId=11');
      await user.click(await screen.findByLabelText(/Sync to Jira/));
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(createdBody()).toMatchObject({ syncToJira: true, messageId: 11 });
    });

    it('a thread that cannot be loaded says so instead of leaving Create disabled in silence', async () => {
      getById.mockRejectedValue(new Error('404'));
      renderPage('/tickets/create?messageId=11');
      expect(await screen.findByText(/This thread could not be loaded/)).toBeInTheDocument();
      expect(createButton()).toBeDisabled();
    });

    it('a creator in no team is told why a ticket with no thread cannot be created', async () => {
      auth.user = { id: 7, role: 'user', organizationRole: 'support', departmentIds: [] };
      renderPage();
      expect(await screen.findByText(/you are not in\s+any/)).toBeInTheDocument();
      expect(createButton()).toBeDisabled();
    });

    it('CONTROL: a creator with a team sees no such notice', async () => {
      renderPage();
      await waitFor(() => expect(assignable).toHaveBeenCalled());
      expect(screen.queryByText(/you are not in\s+any/)).toBeNull();
    });

    it('at most 5 files of 10 MB are kept — the upload route refuses the whole batch past that', async () => {
      const user = userEvent.setup();
      const { container } = renderPage();
      await fill(user);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const small = (index: number) => new File(['x'], `f${index}.txt`, { type: 'text/plain' });
      const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
      Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
      await user.upload(input, [big, ...[1, 2, 3, 4, 5, 6].map(small)]);
      expect(
        await screen.findByText(/big.pdf is over 10 MB and was left out; only the first 5/)
      ).toBeInTheDocument();
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(uploadAttachments).toHaveBeenCalled());
      const [, files] = uploadAttachments.mock.calls[0] as [number, File[]];
      expect(files.map((file) => file.name)).toEqual([
        'f1.txt',
        'f2.txt',
        'f3.txt',
        'f4.txt',
        'f5.txt',
      ]);
    });

    it('a thread whose body is only a picture can still be created from', async () => {
      getById.mockResolvedValue({
        success: true,
        data: {
          id: 11,
          subject: 'Photo of the damage',
          sender: 'ada@example.com',
          departmentId: 4,
          content: '<p><img src="https://example.com/damage.png"></p>',
        },
      });
      renderPage('/tickets/create?messageId=11');
      await waitFor(() => expect(createButton()).toBeEnabled());
    });

    it('when the threads are not linked, the dialog says so instead of "Ticket created successfully"', async () => {
      const user = userEvent.setup();
      addThreads.mockRejectedValue(new Error('500'));
      renderPage();
      await fill(user);
      await user.click(await screen.findByRole('button', { name: 'Add bob@example.com' }));
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      expect(
        await screen.findByText(
          /created, but its threads could not be linked — add them on its page/
        )
      ).toBeInTheDocument();
      expect(screen.queryByText('Ticket created successfully')).toBeNull();
    });

    it('another team: the owner is chosen again, even someone who could own it there too', async () => {
      auth.user = { id: 1, role: 'admin', organizationRole: null, departmentIds: [] };
      assignable.mockResolvedValue([
        { id: 9, firstName: 'Kim', lastName: 'Agent', email: 'kim@example.com', role: 'user' },
      ]);
      renderPage();
      const owner = () => screen.getByRole('combobox', { name: 'Owner' });
      await waitFor(async () => expect(await listOptions(owner())).toContain('Kim Agent'));
      fireEvent.keyDown(owner(), { key: 'Escape' });
      await chooseOption(owner(), 'Kim Agent');
      await chooseOption(screen.getByRole('combobox', { name: 'Team' }), 'Billing');
      await waitFor(() => expect(assignable).toHaveBeenCalledWith(4));
      const user = userEvent.setup();
      await fill(user);
      await waitFor(() => expect(createButton()).toBeEnabled());
      await user.click(createButton());
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(createdBody()).toMatchObject({ departmentId: 4 });
      expect(createdBody()).not.toHaveProperty('assigneeId');
    });
  });

  it('a search that fails after a full page drops its "Showing the newest 25" (#678 review)', async () => {
    const user = userEvent.setup();
    getThreads.mockResolvedValueOnce({
      data: Array.from({ length: 25 }, (_, index) =>
        thread(100 + index, `c${index}@example.com`, `Subject ${index}`)
      ),
    });
    getThreads.mockRejectedValueOnce(new Error('503'));
    renderPage();
    expect(await screen.findByText(/Showing the newest 25/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Threads it explains (optional)'), 'x');
    await waitFor(() => expect(screen.queryByText(/Showing the newest 25/)).toBeNull());
    expect(screen.getByText('No threads match.')).toBeInTheDocument();
  });
});

/**
 * Enhance-ticket answers 429 FREE_AI_ALLOWANCE_USED once the Free starter allowance is used up
 * (release review finding 1): an agent reads the allowance sentence, not "Please try again".
 */
describe('AI enhance refused by the Free starter allowance', () => {
  afterEach(() => {
    enhanceRefusal = null;
    cleanup();
  });

  it.each([429, 402])('%i FREE_AI_ALLOWANCE_USED: "ask your admin", no "try again"', async (status) => {
    const { apiError } = await import('@/test/apiError');
    enhanceRefusal = (await apiError(status, {
      code: 'FREE_AI_ALLOWANCE_USED',
      error: 'Your free AI allowance is used. Add your own AI key to keep AI running.',
    })) as Error;
    auth.user = SUPPORT;
    perms.create = true;
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByTestId('description'), 'Expected delays.');
    await user.click(screen.getByRole('button', { name: /AI enhance/ }));
    expect(
      await screen.findByText(/Your free AI allowance is used — ask your admin/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Please try again/)).not.toBeInTheDocument();
  });

  it('any other failure keeps "Please try again"', async () => {
    const { apiError } = await import('@/test/apiError');
    enhanceRefusal = (await apiError(500, { error: 'boom' })) as Error;
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByTestId('description'), 'Expected delays.');
    await user.click(screen.getByRole('button', { name: /AI enhance/ }));
    expect(await screen.findByText(/Please try again/)).toBeInTheDocument();
  });
});
