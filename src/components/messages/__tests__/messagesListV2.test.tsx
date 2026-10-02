import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';

/**
 * Messages list v2 (Claude Design, 2026-10-02): a compact row density, a split reading layout,
 * and a caption bar that carries the list's own settings. These pin what the new surfaces
 * PROMISE — not their pixels.
 */

vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [{ id: 3, name: 'Support', slug: 'support', color: '#2563EB' }],
  }),
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));
// The caption's Sort needs a ThemeProvider; what is under test here is everything around it.
vi.mock('@/components/ui/ReactSelect', () => ({ ReactSelect: () => null }));

import { MessageListItem } from '../MessageListItem';
import { MessagesListCaption } from '../MessagesListCaption';
import { useListPresentation } from '../useListPresentation';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const thread = (): MessageThread =>
  ({
    threadId: 'conv_7',
    sender: 'marta@northwind.example',
    subject: 'Wrong size, need exchange',
    status: 'open',
    priority: 'high',
    lastMessageAt: new Date().toISOString(),
    messageCount: 3,
    latestMessage: {
      id: 7,
      conversationId: 7,
      publicId: 'SUP-7',
      type: 'inbound',
      status: 'open',
      workflowStatus: 'in_progress',
      priority: 'high',
      departmentId: 3,
      content: 'I still have not got the label.',
      subject: 'Wrong size, need exchange',
      channel: 'email',
      createdAt: new Date().toISOString(),
      assigneeId: null,
      metadata: {},
    },
  }) as unknown as MessageThread;

const renderRow = (props: Partial<Parameters<typeof MessageListItem>[0]> = {}) =>
  render(
    <MemoryRouter>
      <MessageListItem thread={thread()} onOpen={() => {}} {...props} />
    </MemoryRouter>
  );

describe('compact rows', () => {
  it('keep what the card says about the thread: sender, subject, preview, priority, Claim', () => {
    renderRow({ density: 'compact' });
    expect(screen.getByText('marta@northwind.example')).toBeTruthy();
    expect(screen.getByText('Wrong size, need exchange')).toBeTruthy();
    expect(screen.getByText('I still have not got the label.')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeTruthy();
  });

  it('open the thread on click, like the card', () => {
    const onOpen = vi.fn();
    renderRow({ density: 'compact', onOpen });
    fireEvent.click(screen.getByText('I still have not got the label.'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: the comfortable card is still the default, with the conversation id on it', () => {
    renderRow();
    expect(screen.getByTitle('Copy link to this conversation')).toBeTruthy();
  });

  it('mark the thread the split pane is reading', () => {
    renderRow({ density: 'compact', current: true });
    expect(screen.getByRole('button', { current: true })).toBeTruthy();
  });
});

describe('density and layout are remembered per browser', () => {
  it('starts comfortable + list, and keeps a change across a remount', () => {
    const first = renderHook(() => useListPresentation());
    expect(first.result.current.density).toBe('comfortable');
    expect(first.result.current.layout).toBe('list');
    act(() => {
      first.result.current.setDensity('compact');
      first.result.current.setLayout('split');
    });
    first.unmount();

    const second = renderHook(() => useListPresentation());
    expect(second.result.current.density).toBe('compact');
    expect(second.result.current.layout).toBe('split');
  });

  it('CONTROL: a value it does not know falls back to the default', () => {
    localStorage.setItem('messages_list_density', 'tiny');
    const { result } = renderHook(() => useListPresentation());
    expect(result.current.density).toBe('comfortable');
  });
});

const captionProps = {
  selectableCount: 4,
  selectedCount: 0,
  onSelectPage: () => {},
  scope: null,
  shown: 4,
  loading: false,
  onScopeJump: () => {},
  lensActive: false,
  arrivals: {},
  onReviewArrivals: () => {},
  hideAwaiting: false,
  onHideAwaitingChange: () => {},
  sortPreset: 'newest',
  onSortChange: () => {},
  density: 'comfortable' as const,
  onDensityChange: () => {},
  layout: 'list' as const,
  onLayoutChange: () => {},
  canSplit: true,
  narrow: false,
};

describe('the list caption', () => {
  it('counts the selection on THIS page, never "N selected" (the bulk bar owns that phrase)', () => {
    render(<MessagesListCaption {...captionProps} selectedCount={2} />);
    expect(screen.getByText('2 on this page')).toBeTruthy();
    expect(screen.queryByText(/^\d+ selected$/)).toBeNull();
  });

  it('switches density and layout through their own controls', () => {
    const onDensityChange = vi.fn();
    const onLayoutChange = vi.fn();
    render(
      <MessagesListCaption
        {...captionProps}
        onDensityChange={onDensityChange}
        onLayoutChange={onLayoutChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compact rows' }));
    fireEvent.click(screen.getByRole('button', { name: 'Split view' }));
    expect(onDensityChange).toHaveBeenCalledWith('compact');
    expect(onLayoutChange).toHaveBeenCalledWith('split');
  });

  it('offers no split where the screen cannot hold one', () => {
    render(<MessagesListCaption {...captionProps} canSplit={false} />);
    expect(screen.queryByRole('button', { name: 'Split view' })).toBeNull();
  });
});
