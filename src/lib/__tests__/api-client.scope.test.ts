import { describe, it, expect, beforeEach } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { applyRequestContext } from '../api-client';
import { useAuthStore } from '@/stores/authStore';
import { useScopeStore } from '@/stores/scopeStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';
import type { User } from '@/types';

const makeConfig = (url: string, data?: unknown): InternalAxiosRequestConfig =>
  ({ url, method: 'get', headers: {}, data }) as unknown as InternalAxiosRequestConfig;

describe('api-client request interceptor — D-ADM-1 scope headers', () => {
  beforeEach(() => {
    useAuthStore.setState({
      selectedOrganizationId: 5,
      user: { id: 1, email: 'a@b.co', firstName: 'A', role: 'user' } as User,
    });
    useScopeStore.getState().clearScope();
    useDepartmentContextStore.setState({ _selectedByKey: {} });
  });

  it('sends X-Alliance-Context and suppresses X-Organization-Context on /api/alliances', () => {
    useScopeStore.getState().setScope({ scope: 'alliance', allianceId: 9 });
    const config = applyRequestContext(makeConfig('/api/alliances/9/overview'));
    expect(config.headers['X-Alliance-Context']).toBe('9');
    expect(config.headers['X-Organization-Context']).toBeUndefined();
  });

  it('sends X-Organization-Context and no X-Alliance-Context on non-alliance requests', () => {
    const config = applyRequestContext(makeConfig('/api/conversations'));
    expect(config.headers['X-Organization-Context']).toBe('5');
    expect(config.headers['X-Alliance-Context']).toBeUndefined();
  });

  it('suppresses X-Organization-Context on platform-scope requests, even with an org selected (D-ADM-1)', () => {
    // Global-admin platform console is cross-org: a stale org context must never ride
    // along on /api/admin, /api/users, /api/organizations, etc.
    useScopeStore.getState().setScope({ scope: 'platform', allianceId: null });
    const config = applyRequestContext(makeConfig('/api/admin/organizations'));
    expect(config.headers['X-Organization-Context']).toBeUndefined();
    expect(config.headers['X-Alliance-Context']).toBeUndefined();
  });

  it('uses the explicit selection when one is set', () => {
    useAuthStore.setState({
      selectedOrganizationId: 5,
      user: { id: 1, email: 'a@b.co', firstName: 'A', role: 'admin', organizationId: 7 } as User,
    });
    const config = applyRequestContext(makeConfig('/api/audit-logs'));
    expect(config.headers['X-Organization-Context']).toBe('5');
  });

  it('CONTROL: the home-org fallback must NOT leak into platform scope', () => {
    // The platform console is cross-org by definition (D-ADM-1). If the fallback ever
    // moves above the scope branches, a stale home org would scope a cross-org call.
    useAuthStore.setState({
      selectedOrganizationId: null,
      user: { id: 1, email: 'a@b.co', firstName: 'A', role: 'admin', organizationId: 7 } as User,
    });
    useScopeStore.getState().setScope({ scope: 'platform', allianceId: null });
    const config = applyRequestContext(makeConfig('/api/admin/organizations'));
    expect(config.headers['X-Organization-Context']).toBeUndefined();
  });

  it('CONTROL: the home-org fallback must NOT leak onto alliance calls', () => {
    useAuthStore.setState({
      selectedOrganizationId: null,
      user: { id: 1, email: 'a@b.co', firstName: 'A', role: 'admin', organizationId: 7 } as User,
    });
    useScopeStore.getState().setScope({ scope: 'alliance', allianceId: 9 });
    const config = applyRequestContext(makeConfig('/api/alliances/9/overview'));
    expect(config.headers['X-Organization-Context']).toBeUndefined();
    expect(config.headers['X-Alliance-Context']).toBe('9');
  });

  it('sends no org header at all when there is neither a selection nor a home org', () => {
    useAuthStore.setState({
      selectedOrganizationId: null,
      user: { id: 1, email: 'a@b.co', firstName: 'A', role: 'admin' } as User,
    });
    const config = applyRequestContext(makeConfig('/api/audit-logs'));
    expect(config.headers['X-Organization-Context']).toBeUndefined();
  });

  it('strips the JSON Content-Type for FormData and keeps X-Department-Context unchanged', () => {
    // Department selection is keyed "{userId}:{orgId}" — matches the beforeEach user/org.
    useDepartmentContextStore.setState({ _selectedByKey: { '1:5': [2, 3] } });
    const config = makeConfig('/api/conversations', new FormData());
    config.headers['Content-Type'] = 'application/json';
    const result = applyRequestContext(config);
    expect(result.headers['Content-Type']).toBeUndefined();
    expect(result.headers['X-Department-Context']).toBe('2,3');
  });
});

describe('scopeStore', () => {
  it('setScope updates allianceId and is NOT persisted to localStorage', () => {
    useScopeStore.getState().setScope({ scope: 'alliance', allianceId: 42 });
    expect(useScopeStore.getState().allianceId).toBe(42);
    expect(useScopeStore.getState().scope).toBe('alliance');

    // Unlike authStore ('auth-storage'), scope is URL-derived and must not survive a reload.
    const persistedScope = Object.keys(localStorage).some((key) =>
      key.toLowerCase().includes('scope')
    );
    expect(persistedScope).toBe(false);
  });

  it('clearScope resets to the null baseline', () => {
    useScopeStore.getState().setScope({ scope: 'alliance', allianceId: 7 });
    useScopeStore.getState().clearScope();
    expect(useScopeStore.getState().allianceId).toBeNull();
    expect(useScopeStore.getState().scope).toBeNull();
  });
});
