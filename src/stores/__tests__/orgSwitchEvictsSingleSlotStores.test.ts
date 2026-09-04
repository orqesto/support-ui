/**
 * The stores that hold ONE global slot — users, audit logs, the current organization —
 * cannot be keyed by identity the way the list caches are, so they evict on an org switch.
 *
 * Without this an in-place switch painted the previous workspace's users and audit rows
 * under the new one's context for the whole refetch, kept a `userId` filter from a user
 * who does not exist in the new workspace, and let `CreateUserModal` read the previous
 * workspace's `isSystem`. Audit u38 P1-0 / P1-0b.
 *
 * Uses the REAL auth store: the subscription is the thing under test.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { useAuditLogsStore } from '@/stores/auditLogsStore';
import { useOrganizationsStore } from '@/stores/organizationsStore';
import type { User } from '@/types';
import type { AuditLog } from '@/services/auditLog.service';
import type { Organization } from '@/services/organization.service';

const seed = () => {
  useUsersStore.getState().setUsers([{ id: 1, email: 'a@acme.test' } as User]);
  useAuditLogsStore.getState().setLogs([{ id: 1, action: 'login' } as unknown as AuditLog]);
  useAuditLogsStore.getState().setFilters({ userId: 1, page: 1, limit: 50 });
  useOrganizationsStore
    .getState()
    .setCurrentOrganization({ id: 1, name: 'Acme', isSystem: true } as unknown as Organization);
};

const snapshot = () => ({
  users: useUsersStore.getState().users.length,
  logs: useAuditLogsStore.getState().logs.length,
  userIdFilter: useAuditLogsStore.getState().filters.userId,
  currentOrg: useOrganizationsStore.getState().currentOrganization?.id ?? null,
});

beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
  seed();
});

describe('an organization switch evicts the single-slot stores', () => {
  it('THE FIX: switching the selected organization clears all three', () => {
    expect(snapshot()).toEqual({ users: 1, logs: 1, userIdFilter: 1, currentOrg: 1 });

    useAuthStore.setState({ selectedOrganizationId: 2 });

    expect(snapshot()).toEqual({ users: 0, logs: 0, userIdFilter: undefined, currentOrg: null });
  });

  it('CONTROL: re-setting the same organization keeps everything', () => {
    useAuthStore.setState({ selectedOrganizationId: 1 });
    expect(snapshot()).toEqual({ users: 1, logs: 1, userIdFilter: 1, currentOrg: 1 });
  });

  it('CONTROL: an unrelated auth change keeps everything', () => {
    useAuthStore.setState({ user: { id: 9, firstName: 'Renamed' } as User });
    expect(snapshot()).toEqual({ users: 1, logs: 1, userIdFilter: 1, currentOrg: 1 });
  });
});
