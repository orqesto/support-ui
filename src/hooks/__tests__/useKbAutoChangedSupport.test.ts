import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import { useKbAutoChangedSupport } from '../useKbAutoChangedSupport';

afterEach(() => useAuthStore.setState({ selectedOrganizationId: null }));

describe('useKbAutoChangedSupport', () => {
  it('learns from the answer, and forgets it when the workspace changes', () => {
    useAuthStore.setState({ selectedOrganizationId: 1 });
    const setFilter = vi.fn();
    const applied = { requested: 'auto_changed' as const, applied: false };
    const { result } = renderHook(() => useKbAutoChangedSupport(applied, setFilter));
    expect(result.current).toBe(false);
    expect(setFilter).toHaveBeenCalledWith('auto_removed');
    act(() => {
      useAuthStore.setState({ selectedOrganizationId: 2 });
    });
    expect(result.current).toBeNull();
  });

  it('is not reset by an unrelated render in the same workspace', () => {
    useAuthStore.setState({ selectedOrganizationId: 1 });
    const applied = { requested: 'auto_changed' as const, applied: true };
    const { result, rerender } = renderHook(() => useKbAutoChangedSupport(applied, vi.fn()));
    rerender();
    expect(result.current).toBe(true);
  });
});
