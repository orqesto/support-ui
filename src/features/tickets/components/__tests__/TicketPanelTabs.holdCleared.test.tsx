/**
 * Review of #902: Clear reason on the ticket page's comments re-reads the ticket's thread rows,
 * which say "On hold: <reason>".
 */
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const seen = vi.hoisted(() => ({
  cleared: undefined as undefined | (() => void),
  refreshKeys: [] as Array<number | undefined>,
}));
vi.mock('../TicketComments', () => ({
  TicketComments: (props: { onHoldReasonCleared?: () => void }) => {
    seen.cleared = props.onHoldReasonCleared;
    return null;
  },
}));
vi.mock('../TicketThreads', () => ({
  TicketThreads: (props: { refreshKey?: number }) => {
    seen.refreshKeys.push(props.refreshKey);
    return null;
  },
}));
vi.mock('../TicketAttachments', () => ({ TicketAttachments: () => null }));

const { TicketPanelTabs } = await import('../TicketPanelTabs');

describe('TicketPanelTabs — hold reason cleared', () => {
  it('🔴 a clear in the comments hands the thread list a new refreshKey', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TicketPanelTabs
          ticketId={4}
          hasJiraLink={false}
          linkedMessages={[]}
          loadingMessages={false}
        />
      </QueryClientProvider>
    );
    const before = seen.refreshKeys.at(-1);
    expect(seen.cleared).toBeTypeOf('function');
    act(() => seen.cleared?.());
    expect(seen.refreshKeys.at(-1)).toBe((before ?? 0) + 1);
  });
});
