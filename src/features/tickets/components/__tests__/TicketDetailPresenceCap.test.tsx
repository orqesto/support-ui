/**
 * The ticket header's presence cap note: shown when the ticket has more threads than the watch
 * cap, or when the server capped the watch; never when everything is watched. The number shown is
 * min(cap, total), so it can never read "latest 50 of 30 threads".
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Message, Ticket } from '@/types';

const watch = vi.hoisted(() => ({
  result: { available: true, capped: false, viewers: [], settings: null } as {
    available: boolean;
    capped: boolean;
    viewers: unknown[];
    settings: { ticketWatchCap: number } | null;
  },
  ids: [] as number[][],
  threads: [] as unknown[],
}));

vi.mock('@/features/messages', () => ({
  addNoopenerHook: () => {},
  useIsPhone: () => false,
  usePresenceWatch: (ids: number[]) => {
    watch.ids.push(ids);
    return watch.result;
  },
  PresenceEye: ({ capNote }: { capNote?: string }) => <p data-testid="cap-note">{capNote ?? ''}</p>,
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getAll: () => Promise.resolve({ data: watch.threads }) },
}));
vi.mock('@/services/settings.service', () => ({
  labelService: {
    getTicketLabels: () => Promise.resolve([]),
    getLabels: () => Promise.resolve([]),
  },
}));
vi.mock('@/features/tickets/services/category.service', () => ({
  categoryService: { getAll: () => Promise.resolve({ success: true, data: [] }) },
}));
vi.mock('@/features/tickets/services/ticket.service', () => ({
  ticketService: { update: () => Promise.resolve() },
}));
vi.mock('@/hooks/useTeamsEnabled', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTeamsEnabled: () => true,
  deriveTeamsEnabled: () => true,
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartmentById: () => undefined }));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {}, info: () => {} } }));
vi.mock('@/components/admin/AssignmentSelect', () => ({ AssignmentSelect: () => null }));
vi.mock('@/components/shared/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('../MoveDepartmentDialog', () => ({ MoveDepartmentDialog: () => null }));
vi.mock('../TicketPanelTabs', () => ({ TicketPanelTabs: () => null }));

import { TicketDetail } from '../TicketDetail';

const ticket = {
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
} as Ticket;

const threads = (count: number) =>
  Array.from(
    { length: count },
    (_, idx) =>
      ({
        id: idx + 1,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, idx)).toISOString(),
      }) as Message
  );

const renderWith = async (count: number, over: Partial<typeof watch.result> = {}) => {
  watch.threads = threads(count);
  watch.result = { available: true, capped: false, viewers: [], settings: null, ...over };
  render(
    <MemoryRouter>
      <TicketDetail
        ticket={ticket}
        showFullPageButton={false}
        renderChrome={(more, body) => (
          <>
            {more}
            {body}
          </>
        )}
      />
    </MemoryRouter>
  );
  // The linked threads arrive after the first render.
  await screen.findByRole('heading', { name: 'Parcel stuck' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  return screen.getByTestId('cap-note');
};

describe('TicketDetail presence cap note', () => {
  afterEach(() => {
    cleanup();
    watch.ids = [];
  });

  it('more threads than the cap: the note names the cap and the total', async () => {
    const note = await renderWith(70);
    expect(note).toHaveTextContent('presence for the latest 50 of 70 threads');
    expect(watch.ids.at(-1)).toHaveLength(50);
  });

  it('the server cap (ticketWatchCap) is the number shown', async () => {
    const note = await renderWith(40, { settings: { ticketWatchCap: 30 } });
    expect(note).toHaveTextContent('presence for the latest 30 of 40 threads');
  });

  it('the hook reports capped: the note shows, and never "50 of 30"', async () => {
    const note = await renderWith(30, { capped: true, available: false });
    expect(note).toHaveTextContent('presence for the latest 30 of 30 threads');
    expect(note).not.toHaveTextContent('50 of 30');
  });

  it('exactly at the cap and not capped: no note', async () => {
    expect(await renderWith(50)).toBeEmptyDOMElement();
  });

  it('under the cap and not capped: no note', async () => {
    expect(await renderWith(3)).toBeEmptyDOMElement();
  });
});
