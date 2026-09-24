/**
 * A link to a merged-away ticket, opened COLD: the URL must end up naming the survivor the way
 * every other link does — `ADM-INF-25`, never the bare `INF-25`.
 *
 * Staging, 2026-09-24: `/messages?id=ADM-SUP-7` on a fresh page load rewrote to `?id=INF-25`.
 * The fetch starts before `/organizations/current` has answered, and the rewrite read the
 * workspace code from the render that started the fetch — `undefined`.
 */
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orgCode = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => orgCode.value }));

const getById = vi.hoisted(() => vi.fn());
vi.mock('@/services/message.service', () => ({ messageService: { getById } }));

import { useMessagesUrlSync } from '@/hooks/useMessagesUrlSync';

const survivor = { id: 6439, publicId: 'INF-25' };

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

describe('merged-away link — the URL names the survivor with the workspace code', () => {
  beforeEach(() => {
    orgCode.value = undefined;
    getById.mockReset();
    getById.mockResolvedValue({ success: true, data: survivor });
    search = '';
  });

  it('waits for the workspace code instead of writing the bare id', async () => {
    const view = mount('/messages?id=ADM-SUP-7');
    await waitFor(() => expect(getById).toHaveBeenCalledWith('ADM-SUP-7', undefined));
    // The survivor is on screen, the code has not loaded: nothing bare may be written.
    await act(async () => {
      await Promise.resolve();
    });
    expect(new URLSearchParams(search).get('id')).toBe('ADM-SUP-7');

    orgCode.value = 'ADM';
    view.rerender(
      <MemoryRouter initialEntries={['/messages?id=ADM-SUP-7']}>
        <Probe />
      </MemoryRouter>
    );
    await waitFor(() => expect(new URLSearchParams(search).get('id')).toBe('ADM-INF-25'));
  });

  it('rewrites at once when the code is already there (warm load)', async () => {
    orgCode.value = 'ADM';
    mount('/messages?id=ADM-SUP-7');
    await waitFor(() => expect(new URLSearchParams(search).get('id')).toBe('ADM-INF-25'));
  });

  it('never rewrites an ordinary open, before or after the code loads', async () => {
    const view = mount('/messages?id=ADM-INF-25');
    await waitFor(() => expect(getById).toHaveBeenCalled());
    orgCode.value = 'ADM';
    view.rerender(
      <MemoryRouter initialEntries={['/messages?id=ADM-INF-25']}>
        <Probe />
      </MemoryRouter>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(new URLSearchParams(search).get('id')).toBe('ADM-INF-25');
  });
});
