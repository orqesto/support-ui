/**
 * "Delivered to" when its address list could not be read (the backend's bounded read timed out,
 * or failed): the filter stays and its panel says so with a retry. It used to read as an empty
 * list — the filter vanished, as if the workspace received mail at no address.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { FilterTokenBar } from '../FilterTokenBar';
import { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS, type DynamicOptions } from '../filterSchema';
import type { FilterState } from '@/stores/messagesStore';
import { ReceivedAtOptionsError } from '@/services/receivedAtOption';

const getReceivedAtOptions = vi.fn<() => Promise<unknown[]>>();
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));
vi.mock('@/services/assignment.service', () => ({
  assignmentService: { getAssignableUsers: () => Promise.resolve([]) },
}));
vi.mock('@/services/messageSourceOptions.service', () => ({
  getMessageSourceOptions: () => Promise.resolve([]),
}));
vi.mock('@/services/settings.service', () => ({
  labelService: { getLabels: () => Promise.resolve([]) },
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getReceivedAtOptions: () => getReceivedAtOptions() },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {}, info: () => {}, debug: () => {} } }));

const { useFilterOptions } = await import('../useFilterOptions');

const ROWS = [
  { address: 'help@shop.example', ours: true, conversations: 3, deliveredConversations: 3 },
  { address: 'sales@shop.example', ours: true, conversations: 2, deliveredConversations: 2 },
];

beforeEach(() => getReceivedAtOptions.mockReset());
afterEach(cleanup);

const openPanel = (dynamic: DynamicOptions) => {
  render(
    <FilterTokenBar
      defs={buildFilterDefs(dynamic)}
      filters={{} as FilterState}
      isKanban={false}
      onFilterChange={vi.fn()}
      onFilterPatch={vi.fn()}
      onCommitSearch={vi.fn()}
    />
  );
  fireEvent.mouseDown(screen.getByLabelText(/filter or search/i));
};

describe('Delivered to — a list that could not be read', () => {
  it('the filter stays; its panel says so and Retry asks again', () => {
    const onRetry = vi.fn();
    openPanel({
      ...EMPTY_DYNAMIC_OPTIONS,
      aliasesError: { message: "Couldn't load addresses — it took too long.", onRetry },
    });
    fireEvent.click(screen.getByText('Delivered to'));
    expect(screen.getByRole('status')).toHaveTextContent(
      "Couldn't load addresses — it took too long."
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: no addresses and no error (an older backend, no route) — no filter, as before', () => {
    openPanel(EMPTY_DYNAMIC_OPTIONS);
    expect(screen.queryByText('Delivered to')).toBeNull();
  });
});

describe('useFilterOptions — the received-at read', () => {
  it('a timed-out read reports itself; Retry reads again and fills the list', async () => {
    getReceivedAtOptions
      .mockRejectedValueOnce(new ReceivedAtOptionsError(true))
      .mockResolvedValueOnce(ROWS);
    const { result } = renderHook(() => useFilterOptions());
    await waitFor(() => expect(result.current.aliasesError).toBeDefined());
    expect(result.current.aliasesError?.message).toBe(
      "Couldn't load addresses — it took too long."
    );
    expect(result.current.aliases).toEqual([]);

    act(() => result.current.aliasesError?.onRetry());
    await waitFor(() => expect(result.current.aliases).toHaveLength(2));
    expect(result.current.aliasesError).toBeUndefined();
    expect(getReceivedAtOptions).toHaveBeenCalledTimes(2);
  });

  it('any other failure says only that it could not load', async () => {
    getReceivedAtOptions.mockRejectedValueOnce(new ReceivedAtOptionsError(false));
    const { result } = renderHook(() => useFilterOptions());
    await waitFor(() =>
      expect(result.current.aliasesError?.message).toBe("Couldn't load addresses.")
    );
  });

  it('CONTROL: an absent route ([]) is no filter and no error', async () => {
    getReceivedAtOptions.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useFilterOptions());
    await waitFor(() => expect(getReceivedAtOptions).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(result.current.aliasesError).toBeUndefined();
  });
});
