/**
 * F4 / D5: the eye on a hidden entry UNHIDES it (PATCH /unhide) at every site that used to approve
 * it — the KB table, the mobile card and the detail drawer. Only a REJECTED entry's eye still
 * approves ("Restore"), as it always said. The service runs through the REAL api-client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, routeAbsent } from '@/test/apiTransport';
import { kbService, type KBEntry } from '@/services/kb.service';

vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));

const { KBEntryCard } = await import('../KBEntryCard');
const { KBTableView } = await import('../KBTableView');
const { KBEntryDetail } = await import('../KBEntryDetail');

const hiddenEntry: KBEntry = {
  id: 7,
  type: 'qa_pair',
  title: 'Where is my refund?',
  content: 'Question: Where is my refund?\n\nAnswer: 5 days.',
  category: 'support',
  departmentId: null,
  qualityScore: 0.8,
  approved: false,
  hidden: true,
  usageCount: 0,
  createdAt: '2026-09-19T09:00:00.000Z',
  sourceDeleted: false,
  typeData: { question: 'Where is my refund?', answer: '5 days.' },
};
const rejectedEntry: KBEntry = { ...hiddenEntry, rejectedAt: '2026-10-01T00:00:00.000Z' };

const handlers = () => ({
  onView: vi.fn(),
  onApprove: vi.fn(),
  onHide: vi.fn(),
  onUnhide: vi.fn(),
  onReject: vi.fn(),
  onDelete: vi.fn(),
});

let wire: ReturnType<typeof installTransport>;
let current: KBEntry = hiddenEntry;
beforeEach(() => {
  current = hiddenEntry;
  wire = installTransport(apiClient, (request) =>
    request.method === 'GET' && request.path === '/api/knowledge-base/entries/7'
      ? ok(current)
      : routeAbsent(request)
  );
});
afterEach(() => wire.restore());

const sites = {
  table: (entry: KBEntry, props: ReturnType<typeof handlers>) =>
    render(
      <MemoryRouter>
        <KBTableView entries={[entry]} loading={false} canReview {...props} />
      </MemoryRouter>
    ),
  card: (entry: KBEntry, props: ReturnType<typeof handlers>) =>
    render(
      <MemoryRouter>
        <KBEntryCard entry={entry} canReview {...props} />
      </MemoryRouter>
    ),
  drawer: (entry: KBEntry, props: ReturnType<typeof handlers>) =>
    render(
      <MemoryRouter>
        <KBEntryDetail entry={entry} onClose={vi.fn()} canReview {...props} />
      </MemoryRouter>
    ),
};

describe('Unhide is wired to unhide at every site (F4)', () => {
  for (const [site, mount] of Object.entries(sites)) {
    it(`${site}: Unhide calls onUnhide, never onApprove`, async () => {
      const props = handlers();
      mount(hiddenEntry, props);
      fireEvent.click(await screen.findByRole('button', { name: 'Unhide' }));
      expect(props.onUnhide).toHaveBeenCalledWith(7);
      expect(props.onApprove).not.toHaveBeenCalled();
    });

    it(`${site}: a REJECTED entry's eye is Restore, and still approves`, async () => {
      current = rejectedEntry;
      const props = handlers();
      mount(rejectedEntry, props);
      fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
      expect(props.onApprove).toHaveBeenCalledWith(7);
      expect(props.onUnhide).not.toHaveBeenCalled();
    });
  }
});

describe('kbService.unhide through the real api-client', () => {
  it('PATCHes /entries/:id/unhide and reports the state the backend restored', async () => {
    wire.restore();
    wire = installTransport(apiClient, () => ok({ id: 7, approved: true }));
    await expect(kbService.unhide(7)).resolves.toEqual({ outcome: 'unhidden', approved: true });
    expect(wire.requests[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/knowledge-base/entries/7/unhide',
    });
  });

  it('a backend without the route (Express HTML 404) is "unsupported" — nothing approved', async () => {
    wire.restore();
    wire = installTransport(apiClient, routeAbsent);
    await expect(kbService.unhide(7)).resolves.toEqual({ outcome: 'unsupported' });
    expect(wire.requests.map((request) => request.path)).toEqual([
      '/api/knowledge-base/entries/7/unhide',
    ]);
  });

  it('a JSON 404 from a route that EXISTS (entry gone) is an error, not "unsupported"', async () => {
    wire.restore();
    wire = installTransport(apiClient, () => ({
      status: 404,
      data: { success: false, error: 'Entry not found' },
    }));
    await expect(kbService.unhide(7)).rejects.toThrow('Entry not found');
  });

  it('no `approved` in the answer ⇒ null (the caller re-reads), never a guess', async () => {
    wire.restore();
    wire = installTransport(apiClient, () => ok(null));
    await expect(kbService.unhide(7)).resolves.toEqual({ outcome: 'unhidden', approved: null });
  });
});
