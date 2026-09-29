/**
 * WIRING: the lookup editor's URL is actually mounted in the app, behind sign-in.
 *
 * The page's own tests render it inside a hand-built router, so they keep passing if App.tsx
 * never mounts it, mounts it on a typo'd path, or drops the PrivateRoute around it. This renders
 * the REAL route table at the REAL address the Settings list navigates to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';
import { customApiLookupPath } from '@/components/settings/customApi/lookupPaths';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

vi.mock('@/pages/CustomApiLookupPage', () => ({
  CustomApiLookupPage: () => <p>lookup editor page</p>,
}));
vi.mock('@/pages/LoginPage', () => ({ LoginPage: () => <p>login page</p> }));
vi.mock('@/pages/NotFoundPage', () => ({ default: () => <p>not found page</p> }));
vi.mock('@/hooks/useRolePermissionMatrix', () => ({ useRolePermissionMatrix: () => {} }));

const at = (path: string) => window.history.pushState({}, '', path);

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    // A role is present, as after the profile restore — otherwise App holds on its restore gate.
    user: {
      id: 1,
      email: 'admin@example.com',
      role: 'user',
      organizationRole: 'moderator',
    } as User,
  });
});

afterEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  at('/');
});

describe('the custom-API lookup editor route', () => {
  it('is mounted at the address the Settings list navigates to', async () => {
    at(customApiLookupPath(1, 5));
    render(<App />);
    expect(await screen.findByText('lookup editor page')).toBeTruthy();
  });

  it('serves `new` too — the address “Add a lookup” goes to', async () => {
    at(customApiLookupPath(1, 'new'));
    render(<App />);
    expect(await screen.findByText('lookup editor page')).toBeTruthy();
  });

  it('⛔ is behind sign-in: a signed-out visitor goes to the login page', async () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    at(customApiLookupPath(1, 5));
    render(<App />);
    expect(await screen.findByText('login page')).toBeTruthy();
    expect(screen.queryByText('lookup editor page')).toBeNull();
  });

  it('a near-miss address is NOT the editor (control: the route is specific)', async () => {
    at('/settings/custom-apis/1/lookups');
    render(<App />);
    expect(await screen.findByText('not found page')).toBeTruthy();
    expect(screen.queryByText('lookup editor page')).toBeNull();
  });
});
