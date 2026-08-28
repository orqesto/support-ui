import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';

/**
 * The full-page message route has to offer the same reclassification actions as
 * the inbox slide-over.
 *
 * MessageDetail gates its whole filtered action block on `isFiltered &&
 * onClassify`, so a page that omits the prop does not merely disable a button —
 * it removes "Not Spam — Approve" and "Move to Spam" from the page entirely. The
 * slide-over passed it and this page did not, which meant the same message
 * offered different actions depending on how it was opened. The Orphaned Outbound
 * list links straight here, so an orphan had no way out of the orphan lens at all.
 */

const classify = vi.fn<(...args: unknown[]) => Promise<{ success: boolean }>>();
classify.mockResolvedValue({ success: true });

vi.mock('@/services/message.service', () => ({
  messageService: {
    getById: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 42,
        channel: 'email',
        sender: 'customer@example.com',
        subject: 'Our reply with no matched parent',
        // The orphan shape: filtered, tagged as outbound with no inbound parent.
        status: 'filtered',
        metadata: { orphanOutgoing: true },
        createdAt: '2026-01-01T10:00:00Z',
      },
    }),
    getThreadMessages: vi.fn().mockResolvedValue({ success: true, data: [] }),
    classify: (...args: unknown[]) => classify(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Stand-in for MessageDetail that reports whether the page handed it onClassify.
vi.mock('@/components/messages/MessageDetail', () => ({
  MessageDetail: ({
    onClassify,
  }: {
    onClassify?: (action: 'approve' | 'mark_suspicious' | 'move_to_spam') => Promise<void>;
  }) =>
    onClassify ? (
      <button onClick={() => void onClassify('approve')}>approve</button>
    ) : (
      <span data-testid="no-classify-handler" />
    ),
}));

import { MessageDetailPage } from '@/pages/MessageDetailPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/messages/42']} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/messages/:id" element={<MessageDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('MessageDetailPage — reclassifying a filtered message', () => {
  afterEach(() => {
    cleanup();
    classify.mockClear();
  });

  it('gives the detail an onClassify handler', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText('approve')).toBeTruthy());
    expect(screen.queryByTestId('no-classify-handler')).toBeNull();
  });

  it('approving calls the classify endpoint for this message', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText('approve')).toBeTruthy());
    await userEvent.click(screen.getByText('approve'));
    await waitFor(() => expect(classify).toHaveBeenCalled());
    expect(classify.mock.calls[0][0]).toBe(42);
    expect(classify.mock.calls[0][1]).toBe('approve');
  });
});
