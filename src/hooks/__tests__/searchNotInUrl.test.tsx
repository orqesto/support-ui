/**
 * 🔒 A typed search is routinely a customer's address or name. In the URL it sits in the address
 * bar, history, every shared link and the access log — the reason the list itself is a POST
 * (threadsQuery.ts). Neither the filters→URL sync nor the "other views" jump may write it; an old
 * link that carries one still works (release review, 2026-11-02).
 */
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ADM' }));
vi.mock('@/services/message.service', () => ({ messageService: { getById: vi.fn() } }));

import { useMessagesUrlSync } from '@/hooks/useMessagesUrlSync';
import { scopeJumpUrl } from '@/hooks/scopeJumpUrl';
import { defaultFilters, useMessagesStore } from '@/stores/messagesStore';

let search = '';
const Probe = () => {
  useMessagesUrlSync({
    urlSyncedRef: { current: false },
    fetchedMessageIdRef: { current: null },
    fetchMessages: () => Promise.resolve(),
    selectedMessage: null,
    setSelectedMessage: () => undefined,
  });
  search = useLocation().search;
  return null;
};
const mount = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>
  );

beforeEach(() => {
  search = '';
  useMessagesStore.getState().setFilters({ ...defaultFilters });
});

describe('the search never goes into the URL', () => {
  it('🔴 typing a search writes the other filters, not the search', async () => {
    mount('/threads?lifecycle=all');
    await waitFor(() => expect(new URLSearchParams(search).get('lifecycle')).toBe('all'));
    act(() => {
      useMessagesStore
        .getState()
        .setFilters({ ...useMessagesStore.getState().filters, search: 'jane@shop.example' });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(search).not.toContain('jane');
    expect(new URLSearchParams(search).has('search')).toBe(false);
    // CONTROL: the sync did run on that change — the other filters are still written.
    expect(new URLSearchParams(search).get('lifecycle')).toBe('all');
  });

  it('an old link that carries a search still applies it, and the URL drops it', async () => {
    mount('/threads?lifecycle=all&search=jane%40shop.example');
    await waitFor(() =>
      expect(useMessagesStore.getState().filters.search).toBe('jane@shop.example')
    );
    await waitFor(() => expect(new URLSearchParams(search).has('search')).toBe(false));
  });

  it('🔴 the "other views" jump keeps the search out of its URL', () => {
    const url = scopeJumpUrl({ queue: 'spam', lifecycle: 'all', search: 'jane@shop.example' });
    expect(url).toBe('/threads?queue=spam');
  });
});
