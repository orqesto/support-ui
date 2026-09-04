/**
 * The Workspace Details card must show — and let you edit — the workspace whose context
 * the next request will carry, and nothing else.
 *
 * It fetched once per mount and rendered `organizationsStore.currentOrganization`, a single
 * global slot, with no org-id guard. Embedded under the console's WorkspaceShell (which
 * repoints the org context on mount) that meant the PREVIOUS workspace's name and
 * description stayed on screen, editable, under the new one's context. Audit u37 P0-3.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand');
  type State = { user: null; selectedOrganizationId: number | null };
  const useAuthStore = create<State>(() => ({ user: null, selectedOrganizationId: 7 }));
  return { useAuthStore };
});
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canManageOrganization: false }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const getCurrent = vi.fn();
vi.mock('@/services/organization.service', () => ({
  organizationService: { getCurrent: () => getCurrent() as unknown },
}));

const { WorkspaceDetailsSettings } = await import('../WorkspaceDetailsSettings');
const { useAuthStore } = await import('@/stores/authStore');
const { useOrganizationsStore } = await import('@/stores/organizationsStore');

type Org = ReturnType<typeof useOrganizationsStore.getState>['currentOrganization'];
const org = (id: number, name: string): Org =>
  ({
    id,
    name,
    slug: name.toLowerCase(),
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }) as unknown as Org;

/** A promise the test resolves by hand, to order responses explicitly. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  getCurrent.mockReset();
  useAuthStore.setState({ selectedOrganizationId: 7 });
  useOrganizationsStore.getState().clearCache();
});
afterEach(cleanup);

describe('WorkspaceDetailsSettings — keyed on the org it renders', () => {
  it('THE FIX: refetches when the selected organization changes in place', async () => {
    getCurrent.mockResolvedValueOnce(org(7, 'Home')).mockResolvedValueOnce(org(42, 'Client'));
    render(<WorkspaceDetailsSettings />);
    expect(await screen.findByText('Home')).toBeInTheDocument();

    act(() => {
      useAuthStore.setState({ selectedOrganizationId: 42 });
    });

    expect(await screen.findByText('Client')).toBeInTheDocument();
    expect(getCurrent).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
  });

  it('never paints a cached organization whose id is not the selected one', () => {
    useOrganizationsStore.getState().setCurrentOrganization(org(7, 'Home'));
    useAuthStore.setState({ selectedOrganizationId: 42 });
    getCurrent.mockReturnValue(new Promise(() => {}));
    render(<WorkspaceDetailsSettings />);
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
  });

  it('drops a slow answer for the previous workspace that lands after the switch', async () => {
    const slowHome = deferred<Org>();
    getCurrent.mockReturnValueOnce(slowHome.promise).mockResolvedValueOnce(org(42, 'Client'));
    render(<WorkspaceDetailsSettings />);
    await waitFor(() => expect(getCurrent).toHaveBeenCalledTimes(1));

    act(() => {
      useAuthStore.setState({ selectedOrganizationId: 42 });
    });
    expect(await screen.findByText('Client')).toBeInTheDocument();

    // Now the first request — issued under org 7's context — finally answers.
    await act(async () => {
      slowHome.resolve(org(7, 'Home'));
      await slowHome.promise;
    });

    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
    expect(useOrganizationsStore.getState().currentOrganization?.id).toBe(42);
  });

  it('CONTROL: a single workspace loads and renders once', async () => {
    getCurrent.mockResolvedValue(org(7, 'Home'));
    render(<WorkspaceDetailsSettings />);
    expect(await screen.findByText('Home')).toBeInTheDocument();
    expect(getCurrent).toHaveBeenCalledTimes(1);
  });
});
