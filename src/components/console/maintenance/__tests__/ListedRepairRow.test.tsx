/**
 * Console → Maintenance listed repairs (wrong-label replies, outbound-only new threads). Renders
 * the real row and service over a mocked transport, so the request each button sends is what is
 * asserted: Check is a dry run naming the workspace in body and context; Apply needs a Check and
 * a confirm, writes the first 20 of the checked page, then checks again; a cut list says so.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

import { LISTED_REPAIRS, ListedRepairRow } from '../ListedRepairRow';

const wrongLabel = LISTED_REPAIRS.find((def) => def.id === 'repair-wrong-label-replies')!;
const outboundOnly = LISTED_REPAIRS.find((def) => def.id === 'repair-outbound-only-new-threads')!;

const WRONG_LABEL_PATH = '/api/system/repair-wrong-label-replies';
const OUTBOUND_PATH = '/api/system/repair-outbound-only-new-threads';

const messageRow = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  conversationId: 900 + id,
  labels: ['DRAFT'],
  createdAt: '2026-11-01T10:00:00.000Z',
  isNewestInThread: true,
  isOnlyEventInThread: false,
  kbEntries: 0,
  outcome: 'selected',
  ...extra,
});

const wrongLabelCheck = (overrides: Record<string, unknown> = {}) => ({
  data: {
    data: {
      dryRun: true,
      organizationId: 12,
      limit: 200,
      totalInScope: 2,
      selected: 2,
      counts: { selected: 2, removed: 0, error: 0 },
      rows: [messageRow(101, { kbEntries: 2 }), messageRow(102, { labels: ['TRASH'] })],
      nextAfterId: null,
      skippedSent: {
        count: 1,
        rows: [
          { id: 300, conversationId: 930, labels: ['SENT', 'TRASH'], createdAt: '2026-10-01' },
        ],
        truncated: false,
      },
      ...overrides,
    },
  },
});

const renderRow = (def = wrongLabel, organizationId: number | null = 12, allowed = true) =>
  render(
    <ul>
      <ListedRepairRow def={def} organizationId={organizationId} allowed={allowed} />
    </ul>
  );

const confirmApply = async () => {
  // The dialog's own confirm button names the count: "Apply to N …".
  const confirm = await screen.findByRole('button', { name: /^Apply to / });
  fireEvent.click(confirm);
};

beforeEach(() => {
  api.post.mockReset();
});
afterEach(cleanup);

describe('ListedRepairRow — wrong-label replies', () => {
  it('Check sends a dry run with the workspace, then lists the rows, KB entries and sent mail apart', async () => {
    api.post.mockResolvedValue(wrongLabelCheck());
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        WRONG_LABEL_PATH,
        { organizationId: 12, dryRun: true, limit: 200 },
        { organizationContext: 12 }
      )
    );
    const result = await screen.findByTestId('repair-wrong-label-replies-check');
    expect(within(result).getByText('2 messages to change in this workspace.')).toBeTruthy();
    expect(within(result).getByText('All 2 messages are listed.')).toBeTruthy();
    expect(within(result).getAllByText('#101').length).toBeGreaterThan(0);
    expect(within(result).getAllByText('#1001').length).toBeGreaterThan(0); // its thread
    expect(within(result).getByTestId('repair-wrong-label-replies-check-kb').textContent).toMatch(
      /2 knowledge-base entries were made from these messages/
    );
    expect(within(result).getByTestId('repair-wrong-label-replies-check-sent').textContent).toMatch(
      /1 sent message also carries Trash, Spam or Draft\. Sent mail was our real reply and is never removed/
    );
    expect(within(result).queryByTestId('repair-wrong-label-replies-check-more')).toBeNull();
  });

  it('a cut list says more remain and the next batch continues from nextAfterId', async () => {
    api.post.mockResolvedValue(
      wrongLabelCheck({ totalInScope: 450, selected: 2, nextAfterId: 102, limit: 200 })
    );
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    const result = await screen.findByTestId('repair-wrong-label-replies-check');
    expect(within(result).getByText('450 messages to change in this workspace.')).toBeTruthy();
    expect(within(result).queryByText(/are listed\./)).toBeNull();
    expect(within(result).getByTestId('repair-wrong-label-replies-check-more').textContent).toMatch(
      /more remain/
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check next batch' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith(
        WRONG_LABEL_PATH,
        { organizationId: 12, dryRun: true, limit: 200, afterId: 102 },
        { organizationContext: 12 }
      )
    );
  });

  it('Apply is off until a Check; it confirms, writes the first 20 with dryRun false, shows outcomes and checks again', async () => {
    api.post
      .mockResolvedValueOnce(wrongLabelCheck({ totalInScope: 30, selected: 30 }))
      .mockResolvedValueOnce({
        data: {
          data: {
            dryRun: false,
            totalInScope: 30,
            selected: 2,
            limit: 20,
            counts: { removed: 1, skipped_odly_sent: 1 },
            rows: [
              messageRow(101, { outcome: 'removed', kbEntries: 2, kbEntriesFlagged: 2 }),
              messageRow(102, { outcome: 'skipped_odly_sent' }),
            ],
            nextAfterId: null,
            kbEntriesFlagged: 2,
          },
        },
      })
      .mockResolvedValueOnce(
        wrongLabelCheck({ totalInScope: 1, selected: 1, rows: [messageRow(102)] })
      );
    renderRow();
    const apply = screen.getByRole('button', { name: 'Apply first 20' });
    expect(apply).toBeInactive();

    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(apply).not.toBeInactive());
    fireEvent.click(apply);
    expect(api.post).toHaveBeenCalledTimes(1); // nothing written before the confirm
    expect(await screen.findByText('Apply to 20 messages?')).toBeTruthy();
    await confirmApply();

    await waitFor(() =>
      expect(api.post).toHaveBeenNthCalledWith(
        2,
        WRONG_LABEL_PATH,
        { organizationId: 12, dryRun: false, limit: 20 },
        { organizationContext: 12 }
      )
    );
    const applied = await screen.findByTestId('repair-wrong-label-replies-applied');
    expect(within(applied).getByText('Removed')).toBeTruthy();
    expect(within(applied).getByText('Kept — sent from Odly')).toBeTruthy();
    expect(
      within(applied).getByTestId('repair-wrong-label-replies-applied-kb-flagged').textContent
    ).toBe(
      '2 knowledge-base entries sent back for review (Needs your decision). They were not deleted.'
    );
    expect(within(applied).getAllByText('2 (2 sent back for review)').length).toBeGreaterThan(0);
    // Checked again: what is left.
    await waitFor(() =>
      expect(api.post).toHaveBeenNthCalledWith(
        3,
        WRONG_LABEL_PATH,
        { organizationId: 12, dryRun: true, limit: 200 },
        { organizationContext: 12 }
      )
    );
    expect(await screen.findByText('Checked again: what is left (nothing changed)')).toBeTruthy();
    // The next Apply is the rest of the checked list.
    expect(screen.getByRole('button', { name: 'Apply the rest (1)' })).not.toBeInactive();
  });

  it('an older backend without kbEntriesFlagged: no review line after Apply', async () => {
    api.post
      .mockResolvedValueOnce(wrongLabelCheck())
      .mockResolvedValueOnce({
        data: {
          data: {
            dryRun: false,
            totalInScope: 2,
            selected: 1,
            counts: { removed: 1 },
            rows: [messageRow(101, { outcome: 'removed', kbEntries: 2 })],
            nextAfterId: null,
          },
        },
      })
      .mockResolvedValueOnce(wrongLabelCheck({ totalInScope: 0, selected: 0, rows: [] }));
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apply first 2' }));
    await confirmApply();
    const applied = await screen.findByTestId('repair-wrong-label-replies-applied');
    expect(within(applied).getByText('Removed')).toBeTruthy();
    expect(
      within(applied).queryByTestId('repair-wrong-label-replies-applied-kb-flagged')
    ).toBeNull();
    expect(within(applied).queryByText(/sent back for review/)).toBeNull();
  });

  it('a failed Check shows the error and leaves Apply off', async () => {
    api.post.mockRejectedValue({ response: { status: 500, data: { message: 'Database down' } } });
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText(/Database down|The check failed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply first 20' })).toBeInactive();
  });

  it('repairs switched off, or no workspace picked: Check and Apply are off', () => {
    renderRow(wrongLabel, 12, false);
    expect(screen.getByRole('button', { name: 'Check' })).toBeInactive();
    cleanup();
    renderRow(wrongLabel, null, true);
    expect(screen.getByRole('button', { name: 'Check' })).toBeInactive();
  });
});

describe('ListedRepairRow — outbound-only new threads', () => {
  it('lists threads by public id, and Apply sends dryRun false for the checked batch', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          data: {
            dryRun: true,
            totalInScope: 3,
            selected: 3,
            limit: 200,
            counts: { selected: 3 },
            rows: [
              {
                id: 7,
                publicId: 'EX-SUP-7',
                createdAt: '2026-11-02T08:00:00Z',
                outcome: 'selected',
              },
              {
                id: 8,
                publicId: 'EX-SUP-8',
                createdAt: '2026-11-02T09:00:00Z',
                outcome: 'selected',
              },
              { id: 9, publicId: null, createdAt: '2026-11-02T09:30:00Z', outcome: 'selected' },
            ],
            nextAfterId: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            dryRun: false,
            totalInScope: 3,
            selected: 3,
            counts: { updated: 2, error: 1 },
            rows: [
              { id: 7, publicId: 'EX-SUP-7', outcome: 'updated' },
              { id: 8, publicId: 'EX-SUP-8', outcome: 'updated' },
              { id: 9, publicId: null, outcome: 'error', detail: 'lock timeout' },
            ],
            nextAfterId: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            dryRun: true,
            totalInScope: 1,
            selected: 1,
            rows: [{ id: 9, outcome: 'selected' }],
          },
        },
      });
    renderRow(outboundOnly);
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    const result = await screen.findByTestId('repair-outbound-only-new-threads-check');
    expect(within(result).getByText('3 threads to change in this workspace.')).toBeTruthy();
    expect(within(result).getAllByText('EX-SUP-7').length).toBeGreaterThan(0);
    expect(within(result).getAllByText('#9').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Apply first 3' }));
    expect(await screen.findByText('Apply to 3 threads?')).toBeTruthy();
    await confirmApply();
    await waitFor(() =>
      expect(api.post).toHaveBeenNthCalledWith(
        2,
        OUTBOUND_PATH,
        { organizationId: 12, dryRun: false, limit: 3 },
        { organizationContext: 12 }
      )
    );
    const applied = await screen.findByTestId('repair-outbound-only-new-threads-applied');
    expect(within(applied).getAllByText('Moved to Pending').length).toBeGreaterThan(0);
    expect(within(applied).getAllByText('lock timeout').length).toBeGreaterThan(0);
    expect(await screen.findByText('1 thread to change in this workspace.')).toBeTruthy();
  });
});
