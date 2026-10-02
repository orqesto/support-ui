/**
 * FE audit 2026-09-29, E-H3: the react-query cache survived a client-side logout and in-place
 * workspace switches. User B signing in within 5 minutes in the same tab could see user A's SLA
 * breach list (customers' addresses and subjects), source names and model lists until a refetch
 * landed. One subscription on the auth store now empties the cache whenever the signed-in user
 * or the selected workspace changes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

vi.mock('@/lib/socketManager', () => ({ forceDisconnect: vi.fn() }));
vi.mock('@/components/messages/AiTabPanel', () => ({ similarResultsCache: { clear: vi.fn() } }));
vi.mock('@/stores/processingPanelStore', () => ({ logoutClearsProcessingPanels: vi.fn() }));

const { useAuthStore } = await import('@/stores/authStore');
const { evictQueriesOnIdentityChange } = await import('../queryClient');

type TestUser = { id: number; email: string; role: string; firstName: string; lastName: string };
const user = (id: number): TestUser => ({
  id,
  email: `u${id}@x`,
  role: 'user',
  firstName: 'U',
  lastName: String(id),
});

let client: QueryClient;
let stop: () => void;
const seed = () => client.setQueryData(['sla-breaches', { days: 30 }], [{ sender: 'a@x' }]);
const cached = () => client.getQueryData(['sla-breaches', { days: 30 }]);

beforeEach(() => {
  client = new QueryClient();
  useAuthStore.setState({
    user: user(1) as never,
    selectedOrganizationId: 10,
    isAuthenticated: true,
  });
  stop = evictQueriesOnIdentityChange(client);
});
afterEach(() => stop());

describe('the query cache does not outlive its identity', () => {
  it('a sign-out empties it', () => {
    seed();
    expect(cached()).toBeDefined();
    useAuthStore.getState().logout();
    expect(cached()).toBeUndefined();
  });

  it('a sign-in as someone else empties it', () => {
    seed();
    useAuthStore.getState().login('t', user(2) as never);
    expect(cached()).toBeUndefined();
  });

  it('an in-place workspace switch empties it', () => {
    seed();
    useAuthStore.getState().setSelectedOrganization(11);
    expect(cached()).toBeUndefined();
  });

  it('CONTROL: a profile refresh for the SAME user and workspace keeps it', () => {
    seed();
    useAuthStore.getState().setUser({ ...user(1), firstName: 'Renamed' } as never);
    useAuthStore.getState().setSelectedOrganization(10);
    expect(cached()).toBeDefined();
  });
});
