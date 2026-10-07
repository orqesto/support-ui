/**
 * Mutation kills — the phone Details card's call site in the header: the sender line and the
 * meta strip's handlers (category, labels, label picker, create label). The strip is stubbed so
 * each handler the header passes is driven on its own; the services are spies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import type { Label } from '@/services/settings.service';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { PHONE_QUERY } from '../useIsPhone';
import { MessageDetailHeader } from '../MessageDetailHeader';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin: true,
    isOrgAdmin: true,
    canManage: true,
    hasPermission: () => true,
  }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], departments: [] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: {
    ticketsOfThread: () => Promise.resolve({ unavailable: false, rows: [], hiddenCount: 0 }),
  },
}));
vi.mock('@/services/conversationMerge.service', () => ({
  conversationMergeService: { listMerges: () => Promise.resolve([]) },
  MergeAssigneeConflictError: class extends Error {},
}));
const spies = vi.hoisted(() => ({
  setCategory: vi.fn(),
  assignLabelToMessage: vi.fn(),
  removeLabelFromMessage: vi.fn(),
  createLabel: vi.fn(),
  getMessageLabels: vi.fn<(id: number) => Promise<Label[]>>(),
}));
vi.mock('@/services/message.service', () => ({
  messageService: new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'setCategory'
          ? spies.setCategory
          : () => Promise.resolve({ success: true, data: null }),
    }
  ),
}));
vi.mock('@/services/category.service', () => ({
  categoryService: { getAll: () => Promise.resolve({ success: true, data: [] }) },
}));
vi.mock('@/services/settings.service', () => ({
  labelService: {
    getMessageLabels: (id: number) => spies.getMessageLabels(id),
    getLabels: () => Promise.resolve([]),
    assignLabelToMessage: spies.assignLabelToMessage,
    removeLabelFromMessage: spies.removeLabelFromMessage,
    createLabel: spies.createLabel,
  },
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

type StripProps = {
  layout?: string;
  showLabelPicker: boolean;
  onSetCategory: (id: number | null) => void;
  onToggleLabel: (label: Label) => void;
  onToggleLabelPicker: () => void;
  onCloseLabelPicker: () => void;
  onCreateLabel?: (name: string) => void;
  messageLabels?: Label[];
};
const strips = vi.hoisted(() => ({ card: null as StripProps | null }));
vi.mock('../HeaderMetaStrip', () => ({
  HeaderMetaStrip: (props: StripProps) => {
    if (props.layout === 'card') strips.card = props;
    return (
      <div data-testid={`strip-${props.layout ?? 'inline'}`}>
        picker:{String(props.showLabelPicker)}
      </div>
    );
  },
}));

const message = {
  id: 1,
  publicId: 'SUP-1',
  status: 'open',
  channel: 'email',
  sender: 'Ada <ada@example.com>',
  subject: 'Hello',
  departmentId: 4,
  createdAt: new Date().toISOString(),
  metadata: {},
} as unknown as Message;

const renderPhone = (over: Partial<Message> = {}) =>
  render(
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MessageDetailHeader
            message={{ ...message, ...over } as Message}
            showFullPageButton={false}
            isFullPage
            threadCount={1}
          />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

const openCard = () => {
  fireEvent.click(screen.getByRole('button', { name: /Details/ }));
  return strips.card!;
};
const pickerText = () => screen.getByTestId('strip-card').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  strips.card = null;
  spies.getMessageLabels.mockResolvedValue([]);
  spies.setCategory.mockResolvedValue({ success: true });
  spies.assignLabelToMessage.mockResolvedValue(undefined);
  spies.createLabel.mockResolvedValue({ id: 9, name: 'Urgent', color: '#f00' });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === PHONE_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});
afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('Phone Details card — the sender line', () => {
  it('an empty sender shows no made-up address', () => {
    renderPhone({ sender: '' });
    const card = screen.getByTestId('mobile-sender-card');
    expect(card.querySelector('b')!.textContent).toBe('');
  });

  it('CONTROL: a named sender shows the name and the address', () => {
    renderPhone();
    const card = screen.getByTestId('mobile-sender-card');
    expect(card.querySelector('b')!.textContent).toBe('Ada');
    expect(card.textContent).toContain('ada@example.com');
  });
});

describe('Phone Details card — the meta strip handlers', () => {
  it('choosing a category sets it on this thread', async () => {
    renderPhone();
    const strip = openCard();
    act(() => strip.onSetCategory(3));
    await waitFor(() => expect(spies.setCategory).toHaveBeenCalledWith(1, 3));
  });

  it('toggling a label assigns it to this thread', async () => {
    renderPhone();
    const strip = openCard();
    act(() => strip.onToggleLabel({ id: 5, name: 'VIP', color: '#0f0' } as Label));
    await waitFor(() => expect(spies.assignLabelToMessage).toHaveBeenCalledWith(1, 5));
  });

  it('the label picker opens, closes on toggle, and closes on close', () => {
    renderPhone();
    openCard();
    expect(pickerText()).toBe('picker:false');
    act(() => strips.card!.onToggleLabelPicker());
    expect(pickerText()).toBe('picker:true');
    act(() => strips.card!.onToggleLabelPicker());
    expect(pickerText()).toBe('picker:false');
    act(() => strips.card!.onToggleLabelPicker());
    expect(pickerText()).toBe('picker:true');
    act(() => strips.card!.onCloseLabelPicker());
    expect(pickerText()).toBe('picker:false');
    act(() => strips.card!.onCloseLabelPicker());
    expect(pickerText()).toBe('picker:false');
  });

  it('creating a label creates it in this thread’s department and assigns it', async () => {
    renderPhone();
    const strip = openCard();
    expect(strip.onCreateLabel).toBeDefined();
    act(() => strip.onCreateLabel!('Urgent'));
    await waitFor(() =>
      expect(spies.createLabel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Urgent', departmentIds: [4] })
      )
    );
    await waitFor(() => expect(spies.assignLabelToMessage).toHaveBeenCalledWith(1, 9));
  });

  it('a reload that started before our own label write does not undo it on screen', async () => {
    const BUG = { id: 5, name: 'Bug', color: '#f00' } as Label;
    spies.getMessageLabels.mockResolvedValue([BUG]);
    spies.removeLabelFromMessage.mockResolvedValue(undefined);
    const tree = (refresh: number) => (
      <ThemeProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <MessageDetailHeader message={message} showFullPageButton={false} isFullPage threadCount={1} labelsRefreshKey={refresh} />
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
    const { rerender } = render(tree(0));
    openCard();
    await waitFor(() => expect(strips.card?.messageLabels).toEqual([BUG]));
    // A contact edit reloads; its answer is slow and was read before our remove committed.
    let finish: (labels: Label[]) => void = () => {};
    spies.getMessageLabels.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    rerender(tree(1));
    await act(async () => {
      strips.card!.onToggleLabel(BUG);
      await Promise.resolve();
    });
    expect(strips.card?.messageLabels).toEqual([]);
    await act(async () => {
      finish([BUG]);
      await Promise.resolve();
    });
    expect(strips.card?.messageLabels).toEqual([]);
  });

  describe('a label reload overlapping our own writes ends on the server\'s list', () => {
    const BUG = { id: 5, name: 'Bug', color: '#f00' } as Label;
    const VIP = { id: 6, name: 'VIP', color: '#0f0' } as Label;
    const tree = (refresh: number) => (
      <ThemeProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <MessageDetailHeader message={message} showFullPageButton={false} isFullPage threadCount={1} labelsRefreshKey={refresh} />
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );

    it('a reload that starts while our remove is still in flight does not bring the chip back', async () => {
      spies.getMessageLabels.mockResolvedValue([BUG]);
      const { rerender } = render(tree(0));
      openCard();
      await waitFor(() => expect(strips.card?.messageLabels).toEqual([BUG]));
      let commitRemove: () => void = () => {};
      spies.removeLabelFromMessage.mockImplementation(() => new Promise<void>((resolve) => (commitRemove = resolve)));
      await act(async () => {
        strips.card!.onToggleLabel(BUG);
        await Promise.resolve();
      });
      // The reload is answered before the remove commits: [Bug] is stale.
      rerender(tree(1));
      await act(async () => {
        await Promise.resolve();
      });
      expect(strips.card?.messageLabels).toEqual([]);
      // Once the remove commits, the labels are asked for again — the server now says [].
      spies.getMessageLabels.mockResolvedValue([]);
      await act(async () => {
        commitRemove();
        await Promise.resolve();
      });
      await waitFor(() => expect(spies.getMessageLabels).toHaveBeenCalledTimes(3));
      expect(strips.card?.messageLabels).toEqual([]);
    });

    it('a reload discarded because a write overlapped it is fetched again — the contact edit still shows', async () => {
      spies.getMessageLabels.mockResolvedValue([BUG]);
      const { rerender } = render(tree(0));
      openCard();
      await waitFor(() => expect(strips.card?.messageLabels).toEqual([BUG]));
      let answerReload: (labels: Label[]) => void = () => {};
      spies.getMessageLabels.mockImplementationOnce(() => new Promise((resolve) => (answerReload = resolve)));
      spies.removeLabelFromMessage.mockRejectedValue(new Error('500'));
      rerender(tree(1)); // a contact label "VIP" was added
      await act(async () => {
        strips.card!.onToggleLabel(BUG); // fails and rolls back
        await Promise.resolve();
      });
      spies.getMessageLabels.mockResolvedValue([BUG, VIP]);
      await act(async () => {
        answerReload([BUG, VIP]);
        await Promise.resolve();
      });
      await waitFor(() => expect(strips.card?.messageLabels).toEqual([BUG, VIP]));
    });
    it('a hung write does not freeze the picker on "Loading labels…"', async () => {
      spies.getMessageLabels.mockResolvedValue([BUG]);
      type PickerProps = { labelsStatus?: string };
      const { rerender } = render(tree(0));
      openCard();
      await waitFor(() => expect(strips.card?.messageLabels).toEqual([BUG]));
      spies.removeLabelFromMessage.mockImplementation(() => new Promise<void>(() => {}));
      await act(async () => {
        strips.card!.onToggleLabel(BUG);
        await Promise.resolve();
      });
      rerender(tree(1));
      await waitFor(() => expect(spies.getMessageLabels).toHaveBeenCalledTimes(2));
      await act(async () => {
        await Promise.resolve();
      });
      expect((strips.card as unknown as PickerProps).labelsStatus).toBe('ready');
      expect(strips.card?.messageLabels).toEqual([]);
    });
  });
});
