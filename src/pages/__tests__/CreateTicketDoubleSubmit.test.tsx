/**
 * Every "Create ticket" now makes a NEW ticket — a thread may be on several (2026-09-30) — so the
 * page must not send twice: a double click, or a click in the 1.5 s before the redirect, used to
 * get the same ticket back and would now make a duplicate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
const empty = () =>
  new Proxy({}, { get: () => () => Promise.resolve({ success: true, data: [] }) });

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: ({ value }: { value: string }) => <div>{value}</div>,
}));
vi.mock('@/lib/api-client', () => ({ apiClient: empty() }));
vi.mock('@/services/assignment.service', () => ({
  assignmentService: { getAssignableUsers: () => Promise.resolve([]) },
}));
vi.mock('@/services/category.service', () => ({ categoryService: empty() }));
vi.mock('@/services/integrations.service', () => ({ integrationsService: empty() }));
vi.mock('@/services/settings.service', () => ({ settingsService: empty() }));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getById: () =>
      Promise.resolve({
        success: true,
        data: { id: 11, subject: 'Cannot pay', content: 'Card declined' },
      }),
    getThreadMessages: () => Promise.resolve({ success: true, data: [] }),
    getThreads: () => Promise.resolve({ success: true, data: [] }),
  },
}));
vi.mock('@/services/ticket.service', () => ({ ticketService: { create } }));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { addThreads: vi.fn() },
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { CreateTicketPage } = await import('@/pages/CreateTicketPage');
const { ThemeProvider } = await import('@/contexts/ThemeContext');

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ success: true, data: { id: 42 } });
});

const renderPage = () =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/tickets/create?messageId=11']}>
        <Routes>
          <Route path="/tickets/create" element={<CreateTicketPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );

// Create is enabled once the thread and its department's owner list are in (CreateTicketPage `ready`).
const readyForm = (container: HTMLElement) =>
  waitFor(() => {
    const found = container.querySelector('form');
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!found || !submit || submit.disabled) throw new Error('form not ready yet');
    return found;
  });

describe('Create ticket — one press, one ticket', () => {
  it('a double submit sends ONE create', async () => {
    const { container } = renderPage();
    const form = await readyForm(container);
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it('after a success the button stays disabled until the redirect', async () => {
    const { container } = renderPage();
    const form = await readyForm(container);
    fireEvent.submit(form);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.submit(form);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: after a FAILED create the agent can try again', async () => {
    create.mockRejectedValueOnce(new Error('boom'));
    const { container } = renderPage();
    const form = await readyForm(container);
    fireEvent.submit(form);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/could not be created|boom/)).toBeInTheDocument();
    fireEvent.submit(form);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  });
});
