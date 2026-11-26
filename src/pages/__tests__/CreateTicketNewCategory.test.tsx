/**
 * Create ticket: creating the AI-suggested category can fail (a 500, or a 2xx without the saved
 * row, which the real settings service now treats as a failed save). The page must say so in its
 * error dialog and leave no unhandled rejection behind.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { chooseOption } from '@/test/chooseOption';

const create = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const uploadAttachments = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const addThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getById = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const assignable = vi.fn<(departmentId: number | undefined) => Promise<unknown[]>>();
const perms = { create: true };
/** Set ⇒ POST /api/settings/categories is refused with this; otherwise it answers 2xx, no row. */
let categoryRefusal: Error | null = null;
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    {
      get: (_target, key) => (url: unknown) =>
        key === 'post' && String(url).includes('/api/settings/categories') && categoryRefusal
          ? Promise.reject(categoryRefusal)
          : Promise.resolve({ data: { success: true } }),
    }
  ),
}));
vi.mock('@/features/tickets/services/category.service', () => ({
  categoryService: {
    getAll: () => Promise.resolve({ success: true, data: [{ id: 1, name: 'Billing' }] }),
  },
}));
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
const integrations: { list: unknown[] } = { list: [] };
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () => Promise.resolve({ success: true, data: integrations.list }),
  },
}));
vi.mock('@/features/tickets/services/ticket.service', () => ({
  ticketService: {
    create: (...args: unknown[]) => create(...args),
    uploadAttachments: (...args: unknown[]) => uploadAttachments(...args),
  },
}));
vi.mock('@/features/tickets/services/ticketThreads.service', () => ({
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
const { ThemeProvider } = await import('@/contexts/ThemeContext');

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

describe('creating the AI-suggested category fails', () => {
  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
    getThreads.mockResolvedValue({ data: [] });
    assignable.mockResolvedValue([]);
    getById.mockResolvedValue({
      success: true,
      data: {
        id: 11,
        subject: 'Parcel held',
        sender: 'ada@example.com',
        departmentId: null,
        content: 'x',
        metadata: { analysis: { suggestedCategory: 'Freight' } },
      },
    });
  });
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    categoryRefusal = null;
    cleanup();
  });

  it.each([
    ['a 2xx without the saved row', null],
    ['a 500', 500],
  ])('%s shows the error dialog and rejects nothing unhandled', async (_label, status) => {
    if (status) {
      const { apiError } = await import('@/test/apiError');
      categoryRefusal = (await apiError(status, { error: 'boom' })) as Error;
    }
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/tickets/create?messageId=11']}>
          <Routes>
            <Route path="/tickets/create" element={<CreateTicketPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    );
    await chooseOption(await screen.findByRole('combobox', { name: 'Category' }), /Create "Freight"/);
    expect(await screen.findByText('Failed to create category.')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unhandled).toEqual([]);
  });

  it('a duplicate name shows why, in category words', async () => {
    const { apiError } = await import('@/test/apiError');
    categoryRefusal = (await apiError(409, {
      success: false,
      code: 'DUPLICATE_RULE',
      error: 'A rule with this name already exists here',
    })) as Error;
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/tickets/create?messageId=11']}>
          <Routes>
            <Route path="/tickets/create" element={<CreateTicketPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    );
    await chooseOption(await screen.findByRole('combobox', { name: 'Category' }), /Create "Freight"/);
    expect(
      await screen.findByText('A category with this name already exists here')
    ).toBeInTheDocument();
    expect(screen.queryByText('Failed to create category.')).toBeNull();
  });
});
