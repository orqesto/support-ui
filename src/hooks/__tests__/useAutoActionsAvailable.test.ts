/** A 5xx / network failure of the availability probe is remembered for 60 s, not re-asked on every mount. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const overview = vi.hoisted(() => ({ getOverview: vi.fn() }));
vi.mock('@/services/kbAutoActions.service', () => ({ kbAutoActionsService: overview }));

import { resetAutoActionsAvailability, useAutoActionsAvailable } from '../useAutoActionsAvailable';

const flush = () => waitFor(() => expect(overview.getOverview).toHaveBeenCalled());

beforeEach(() => {
  resetAutoActionsAvailability();
  overview.getOverview.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => vi.useRealTimers());

describe('useAutoActionsAvailable', () => {
  it('a 500 is not re-probed on the next mounts within 60 s, and is after', async () => {
    overview.getOverview.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const first = renderHook(() => useAutoActionsAvailable(true));
    await flush();
    await vi.waitFor(() => expect(overview.getOverview).toHaveBeenCalledTimes(1));
    first.unmount();

    vi.setSystemTime(Date.now() + 59_000);
    const second = renderHook(() => useAutoActionsAvailable(true));
    await Promise.resolve();
    expect(overview.getOverview).toHaveBeenCalledTimes(1);
    expect(second.result.current).toBe(false);
    second.unmount();

    vi.setSystemTime(Date.now() + 2_000);
    overview.getOverview.mockResolvedValue({});
    const third = renderHook(() => useAutoActionsAvailable(true));
    await vi.waitFor(() => expect(overview.getOverview).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(third.result.current).toBe(true));
  });

  it('a success is cached for the session', async () => {
    overview.getOverview.mockResolvedValue({});
    renderHook(() => useAutoActionsAvailable(true)).unmount();
    await flush();
    const again = renderHook(() => useAutoActionsAvailable(true));
    await vi.waitFor(() => expect(again.result.current).toBe(true));
    expect(overview.getOverview).toHaveBeenCalledTimes(1);
  });
});
