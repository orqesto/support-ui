/**
 * The backend reports which terms' search inside words was cut short; the hook must pass that on,
 * and must cope with a backend that predates the field (FE deploys before the BE tag).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageService } from '@/services/message.service';
import { useMessagesStore } from '@/stores/messagesStore';
import { useMessagesData } from '../useMessagesData';

vi.mock('../useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));

type Response = Awaited<ReturnType<typeof messageService.getThreads>>;
const respond = (search: unknown) =>
  vi.spyOn(messageService, 'getThreads').mockResolvedValue({
    success: true,
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false },
    scope: null,
    search,
  } as unknown as Response);

beforeEach(() => {
  useMessagesStore.getState().clearCache();
  useMessagesStore.setState((state) => ({ filters: { ...state.filters, search: 'nvoic' } }));
});
afterEach(() => {
  vi.restoreAllMocks();
  useMessagesStore.setState((state) => ({ filters: { ...state.filters, search: '' } }));
});

describe('search reading: cut short', () => {
  it('passes on the terms whose search inside words was cut short', async () => {
    respond({ terms: ['nvoic'], asPhrase: false, cutShort: ['nvoic'] });
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef: { current: true } }));
    await waitFor(() => expect(result.current.searchReading?.cutShort).toEqual(['nvoic']));
  });

  it('reads a backend without the field as nothing cut short', async () => {
    respond({ terms: ['nvoic'], asPhrase: false });
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef: { current: true } }));
    await waitFor(() => expect(result.current.searchReading?.terms).toEqual(['nvoic']));
    expect(result.current.searchReading?.cutShort).toEqual([]);
  });

  it('drops a malformed entry rather than rendering it', async () => {
    respond({ terms: ['nvoic'], asPhrase: false, cutShort: ['nvoic', 42, null] });
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef: { current: true } }));
    await waitFor(() => expect(result.current.searchReading?.cutShort).toEqual(['nvoic']));
  });
});
