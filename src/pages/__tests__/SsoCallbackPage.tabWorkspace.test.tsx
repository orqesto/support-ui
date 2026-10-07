/**
 * The SSO landing must adopt the workspace the SSO login was minted for. `/users/me` answers for
 * the workspace the request names (X-Organization-Context — the per-tab selection) whenever the
 * caller is a member there, so a selection left in the tab from before sign-in has to be dropped
 * before the profile is asked for, or it would win over the session's own workspace.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let contextAtRequest: number | null | undefined;
vi.mock('@/services/user.service', () => ({
  userService: {
    getCurrentUser: async () => {
      // The api-client reads the header from this field at request time.
      contextAtRequest = (await import('@/stores/authStore')).useAuthStore.getState()
        .selectedOrganizationId;
      return { id: 9, email: 's@x.y', role: 'user', organizationId: 7 };
    },
  },
}));

const { SsoCallbackPage } = await import('../SsoCallbackPage');
const { useAuthStore } = await import('@/stores/authStore');

afterEach(cleanup);

describe('SSO landing and the tab workspace', () => {
  it('asks the profile without the stale tab workspace and adopts the session workspace', async () => {
    useAuthStore.setState({ selectedOrganizationId: 3 });
    render(
      <MemoryRouter initialEntries={['/sso/callback?sso=1']}>
        <SsoCallbackPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(useAuthStore.getState().selectedOrganizationId).toBe(7));
    expect(contextAtRequest).toBeNull();
  });
});
