import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { Message, User } from '@/types';

/**
 * Lead UI hides unless lead qualification is configured (owner, 2026-10-21). Hidden ONLY on an
 * explicit `configured: false`; an older backend (field absent), a 403 for an agent without
 * settings access, or a failure all keep today's behaviour.
 */

const lead = vi.hoisted(() => ({ answer: (): Promise<unknown> => Promise.resolve({}) }));
vi.mock('@/services/organization.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationService: new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'getLeadConfig' ? () => lead.answer() : () => Promise.resolve({}),
    }
  ),
}));
vi.mock('../AiTabPanel', () => ({ AiTabPanel: () => null }));
vi.mock('@/services/contact.service', () => ({
  contactService: { getNoteSummary: () => Promise.resolve({ count: 0, latest: null }) },
}));
vi.mock('@/components/contacts/useContactProfile', () => ({
  useContactProfile: () => ({ loading: false, contact: null }),
}));
vi.mock('@/services/message.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  messageService: new Proxy({}, { get: () => () => Promise.resolve({ success: true, data: [] }) }),
}));
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    run: vi.fn(),
    availability: () => Promise.resolve(false),
    lookupOptions: () => Promise.resolve([]),
  },
}));

const { useLeadsHidden } = await import('@/hooks/useLeadsHidden');
const { MessagePanelTabs } = await import('../MessagePanelTabs');

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  </MemoryRouter>
);

beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

const answers: [string, () => Promise<unknown>, boolean][] = [
  ['configured: false', () => Promise.resolve({ departments: [], configured: false }), true],
  ['configured: true', () => Promise.resolve({ departments: [3], configured: true }), false],
  ['field absent (older backend)', () => Promise.resolve({ departments: [3] }), false],
  ['403 (agent without settings access)', () => Promise.reject(httpError(403)), false],
  ['404', () => Promise.reject(httpError(404)), false],
  ['500', () => Promise.reject(httpError(500)), false],
];

describe('useLeadsHidden', () => {
  it.each(answers)('%s → hidden=%s', async (_label, answer, hidden) => {
    const spy = vi.fn(answer);
    lead.answer = spy;
    const { result } = renderHook(() => useLeadsHidden(), { wrapper });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // Let the query settle, then read the answer.
    await waitFor(() => expect(result.current).toBe(hidden));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBe(hidden);
  });

  it('many consumers, one request', async () => {
    const spy = vi.fn(() => Promise.resolve({ configured: true }));
    lead.answer = spy;
    renderHook(() => [useLeadsHidden(), useLeadsHidden(), useLeadsHidden()], { wrapper });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

const noop = () => {};
const renderTabs = () =>
  render(
    <MessagePanelTabs
      {...({
        message: {
          id: 41,
          sender: 'a@b.example',
          isLead: true,
          channel: 'email',
          createdAt: '2026-10-21T10:00:00Z',
          metadata: {},
        } as unknown as Message,
        variant: 'sidebar',
        tab: 'notes',
        setTab: noop,
        panelOpen: true,
        setPanelOpen: noop,
        notes: [],
        onNoteUpdated: noop,
        onNoteDeleted: noop,
        noteActivityLog: [],
        messageActivity: [],
        sortedThread: [],
        threadRefreshKey: 0,
        currentUserId: 9,
        leadState: null,
        setLeadState: noop,
        leadFieldDefs: [],
        setComposerMode: noop,
        noteEditorRef: createRef(),
      } as unknown as Parameters<typeof MessagePanelTabs>[0])}
    />,
    { wrapper }
  );

const tabLabels = () =>
  within(screen.getByTestId('panel-tabs-root').firstElementChild as HTMLElement)
    .getAllByRole('button')
    .map((tab) => tab.textContent?.replace(/\d+$/, '').trim());

describe('Lead tab on a lead thread', () => {
  it('hidden when lead qualification is not configured', async () => {
    const spy = vi.fn(() => Promise.resolve({ configured: false }));
    lead.answer = spy;
    renderTabs();
    await waitFor(() => expect(tabLabels()).not.toContain('Lead'));
    expect(spy).toHaveBeenCalled();
  });

  it.each([
    ['configured: true', () => Promise.resolve({ configured: true })],
    ['field absent', () => Promise.resolve({})],
    ['403', () => Promise.reject(httpError(403))],
  ])('CONTROL — %s: shown', async (_label, answer) => {
    const spy = vi.fn(answer);
    lead.answer = spy;
    renderTabs();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tabLabels()).toContain('Lead');
  });
});
