/**
 * A link somebody sent you should land in the workspace that owns it.
 *
 * ⛔ Before: `?id=ORB-MKT-170` opened while you were in g-2 hit an org-scoped lookup that
 * strips a leading `{code}-` only when it matches YOUR org — so it 404'd. Safe, and useless,
 * because the recipient is often a member of the workspace that owns the link.
 *
 * ⛔ A BARE id must be left alone. `MKT-170` exists in every workspace with an MKT
 * department — on prod `INF` and `SUP` each live in six, and 54 ids already resolve in more
 * than one — so there is nothing to follow and guessing is exactly how a link opens the
 * wrong conversation.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const locate = vi.fn<(id: string) => Promise<{ data: unknown }>>();
vi.mock('@/services/sharedLink.service', () => ({
  sharedLinkService: { locate: (id: string) => locate(id) },
}));

// vi.mock factories are hoisted, so the spies must be created INSIDE the factory and read
// back through the mocked module — a top-level const is not initialised yet when it runs.
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const setSelectedOrganization = vi.fn();
const store = { selectedOrganizationId: 38, setSelectedOrganization };
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => store }));

const orgCode = { value: 'G' as string | undefined };
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => orgCode.value }));

import { toast } from '@/lib/toast';
import { useSharedLinkWorkspace } from '../useSharedLinkWorkspace';

const toastError = vi.mocked(toast.error);
const toastInfo = vi.mocked(toast.info);

beforeEach(() => {
  vi.clearAllMocks();
  store.selectedOrganizationId = 38;
  orgCode.value = 'G';
  locate.mockResolvedValue({
    data: {
      status: 'found',
      organizationId: 19,
      organizationSlug: 'orbelli-test',
      publicId: 'MKT-170',
    },
  });
});

describe('useSharedLinkWorkspace', () => {
  it('switches to the workspace the id names', async () => {
    renderHook(() => useSharedLinkWorkspace('ORB-MKT-170'));

    await waitFor(() => expect(setSelectedOrganization).toHaveBeenCalledWith(19));
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining('orbelli-test'));
  });

  it('names the workspace instead of failing silently when you are not a member', async () => {
    locate.mockResolvedValue({ data: { status: 'not-a-member', organizationSlug: 'framehouse' } });

    renderHook(() => useSharedLinkWorkspace('FRA-SUP-9'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toContain('framehouse');
    expect(setSelectedOrganization).not.toHaveBeenCalled();
  });

  it('leaves a BARE id alone — it names no workspace, so there is nothing to follow', async () => {
    renderHook(() => useSharedLinkWorkspace('MKT-170'));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(locate).not.toHaveBeenCalled();
    expect(setSelectedOrganization).not.toHaveBeenCalled();
  });

  it('CONTROL: an id already in THIS workspace does not call out at all', async () => {
    orgCode.value = 'ORB';

    renderHook(() => useSharedLinkWorkspace('ORB-MKT-170'));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(locate).not.toHaveBeenCalled();
  });

  it('CONTROL: a numeric id is not treated as org-prefixed', async () => {
    renderHook(() => useSharedLinkWorkspace('16952'));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(locate).not.toHaveBeenCalled();
  });

  it('asks once per link, even though switching re-renders the page', async () => {
    const { rerender } = renderHook(({ id }) => useSharedLinkWorkspace(id), {
      initialProps: { id: 'ORB-MKT-170' },
    });

    await waitFor(() => expect(locate).toHaveBeenCalledTimes(1));
    rerender({ id: 'ORB-MKT-170' });
    rerender({ id: 'ORB-MKT-170' });

    expect(locate).toHaveBeenCalledTimes(1);
  });
});
