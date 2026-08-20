import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, renderHook, cleanup } from '@testing-library/react';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/authStore';
import { useRoleMatrixStore } from '@/stores/roleMatrixStore';
import { Permission, applyServerRolePermissions, resetRolePermissionsForTests } from '@/types/roles';

/**
 * The re-render wiring, which is the subtle half of the fix.
 *
 * `applyServerRolePermissions` swaps a module-level constant. React cannot observe that, so
 * `usePermissions` subscribes to a revision counter purely to force a re-render when the
 * server's table lands. Without it the table would be fetched, adopted, and have no visible
 * effect for the rest of the session.
 *
 * 🔑 This must assert on RENDERED OUTPUT, not on the hook's return value. The functions
 * `usePermissions` returns read the table at call time, so calling one after the swap gives
 * the new answer whether or not React ever re-rendered — a hook-only test passes even with
 * the subscription deleted, and proves nothing.
 */
const Probe = () => {
  const { hasPermission } = usePermissions();
  return <span data-testid="verdict">{hasPermission(Permission.MANAGE_BILLING) ? 'yes' : 'no'}</span>;
};

afterEach(() => {
  cleanup();
  resetRolePermissionsForTests();
  useRoleMatrixStore.setState({ revision: 0 });
});

describe('usePermissions ← server role matrix', () => {
  it('re-renders consumers when a server table is adopted', () => {
    useAuthStore.setState({
      user: { role: 'user', organizationRole: 'support' },
    } as Parameters<typeof useAuthStore.setState>[0]);

    render(<Probe />);
    expect(screen.getByTestId('verdict')).toHaveTextContent('no');

    act(() => {
      applyServerRolePermissions({ support: [Permission.MANAGE_BILLING] });
      useRoleMatrixStore.getState().bump();
    });

    expect(screen.getByTestId('verdict')).toHaveTextContent('yes');
  });

  it('does not require a QueryClient to render', () => {
    // usePermissions is called across most of the tree. Coupling it to react-query would
    // make a provider mandatory for nearly every component test — hence the store.
    expect(() => renderHook(() => usePermissions())).not.toThrow();
  });
});
