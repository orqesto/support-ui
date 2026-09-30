/**
 * Every "Create ticket" now makes a NEW ticket — a thread may be on several (2026-09-30) — so the
 * page must not send twice: a double click, or a click in the 1.5 s before the redirect, used to
 * get the same ticket back and would now make a duplicate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { createWithAttachments } = vi.hoisted(() => ({ createWithAttachments: vi.fn() }));
const empty = () => new Proxy({}, { get: () => () => Promise.resolve({ success: true, data: [] }) });

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
      Promise.resolve({ success: true, data: { id: 11, subject: 'Cannot pay', content: 'Card declined' } }),
    getThreadMessages: () => Promise.resolve({ success: true, data: [] }),
  },
}));
vi.mock('@/services/ticket.service', () => ({ ticketService: { createWithAttachments } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const { CreateTicketPage } = await import('@/pages/CreateTicketPage');
const { ThemeProvider } = await import('@/contexts/ThemeContext');

beforeEach(() => {
  vi.clearAllMocks();
  createWithAttachments.mockResolvedValue({ success: true, data: { id: 42 } });
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

describe('Create ticket — one press, one ticket', () => {
  it('a double submit sends ONE create', async () => {
    const { container } = renderPage();
    const form = await waitFor(() => {
      const found = container.querySelector('form');
      if (!found) throw new Error('form not rendered yet');
      return found;
    });
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(createWithAttachments).toHaveBeenCalledTimes(1));
  });

  it('after a success the button stays disabled until the redirect', async () => {
    const { container } = renderPage();
    const form = await waitFor(() => {
      const found = container.querySelector('form');
      if (!found) throw new Error('form not rendered yet');
      return found;
    });
    fireEvent.submit(form);
    await waitFor(() => expect(createWithAttachments).toHaveBeenCalledTimes(1));
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.submit(form);
    expect(createWithAttachments).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: after a FAILED create the agent can try again', async () => {
    createWithAttachments.mockRejectedValueOnce(new Error('boom'));
    const { container } = renderPage();
    const form = await waitFor(() => {
      const found = container.querySelector('form');
      if (!found) throw new Error('form not rendered yet');
      return found;
    });
    fireEvent.submit(form);
    await waitFor(() => expect(createWithAttachments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Failed to create ticket')).toBeInTheDocument());
    fireEvent.submit(form);
    await waitFor(() => expect(createWithAttachments).toHaveBeenCalledTimes(2));
  });
});
