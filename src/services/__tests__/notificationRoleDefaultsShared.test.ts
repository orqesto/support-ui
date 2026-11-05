import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchRoles = vi.fn<() => Promise<unknown>>();
vi.mock('../notificationSettingsService', () => ({ fetchRoleDefaults: () => fetchRoles() }));

const shared = await import('../notificationRoleDefaultsShared');
const { invalidateSharedFetch } = await import('@/lib/sharedFetch');
const { useAuthStore } = await import('@/stores/authStore');

beforeEach(() => {
  fetchRoles.mockReset();
  invalidateSharedFetch();
  shared.resetRoleDefaultsUnavailableForTests();
});

describe('shared role defaults read', () => {
  it('two readers in one workspace cost one request; a save drops it', async () => {
    fetchRoles.mockResolvedValue({ roles: [] });
    await Promise.all([shared.loadRoleDefaults(5), shared.loadRoleDefaults(5)]);
    await shared.loadRoleDefaults(5);
    expect(fetchRoles).toHaveBeenCalledTimes(1);
    shared.invalidateRoleDefaults(5);
    await shared.loadRoleDefaults(5);
    expect(fetchRoles).toHaveBeenCalledTimes(2);
  });

  it('another workspace is its own read', async () => {
    fetchRoles.mockResolvedValue({ roles: [] });
    await shared.loadRoleDefaults(5);
    await shared.loadRoleDefaults(6);
    expect(fetchRoles).toHaveBeenCalledTimes(2);
  });

  it('an unavailable workspace is remembered and not probed again, even after the cache is cleared', async () => {
    fetchRoles.mockResolvedValue(null);
    expect(await shared.loadRoleDefaults(5)).toBeNull();
    invalidateSharedFetch();
    expect(await shared.loadRoleDefaults(5)).toBeNull();
    expect(fetchRoles).toHaveBeenCalledTimes(1);
  });

  it('a failed read is not remembered as unavailable', async () => {
    fetchRoles.mockRejectedValueOnce(new Error('boom'));
    await expect(shared.loadRoleDefaults(5)).rejects.toThrow('boom');
    fetchRoles.mockResolvedValue({ roles: [] });
    expect(await shared.loadRoleDefaults(5)).toEqual({ roles: [] });
  });

  it('another person in the same workspace and browser does not inherit the answer or the unavailable memory', async () => {
    useAuthStore.setState({ user: { id: 1 } as never });
    fetchRoles.mockResolvedValue(null);
    expect(await shared.loadRoleDefaults(5)).toBeNull();
    useAuthStore.setState({ user: { id: 2 } as never });
    fetchRoles.mockResolvedValue({ roles: [] });
    expect(await shared.loadRoleDefaults(5)).toEqual({ roles: [] });
    expect(fetchRoles).toHaveBeenCalledTimes(2);
    useAuthStore.setState(useAuthStore.getInitialState());
  });
});
