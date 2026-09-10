/**
 * Settings must let a SCIM-provisioned user SET a first password.
 *
 * Their account holds a non-matching sentinel, so there is no current password to type —
 * and the field carried `required`, which blocked submission in the browser before any
 * request was sent. The account that most needs a password was the one account that could
 * never be given one from inside the app.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileSettings } from '../ProfileSettings';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/auth.service';

vi.mock('@/services/auth.service', () => ({
  authService: { changePassword: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/user.service', () => ({
  userService: {
    getCurrentUser: vi.fn().mockResolvedValue({ id: 1, email: 'v@x.test', hasPassword: true }),
    getSelfSkillValues: vi.fn().mockResolvedValue({}),
    getSelfCanEditSkills: vi.fn().mockResolvedValue(false),
    setSelfSkillValues: vi.fn().mockResolvedValue(undefined),
    updateSelf: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getRoutingKeys: vi.fn().mockResolvedValue([]) },
}));
// Child panels do their own fetching and are irrelevant to the password form.
vi.mock('../TwoFactorSettings', () => ({ TwoFactorSettings: () => null }));
vi.mock('../ActiveSessionsSettings', () => ({ ActiveSessionsSettings: () => null }));

const setUser = (hasPassword: boolean | undefined) => {
  useAuthStore.setState({
    user: {
      id: 1,
      email: 'vincent@tacoteam.info',
      firstName: 'V',
      lastName: 'T',
      role: 'user',
      createdAt: '2026-09-03T07:29:16.949Z',
      ...(hasPassword === undefined ? {} : { hasPassword }),
    },
  } as never);
};

describe('ProfileSettings — first password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides the current-password field and submits with an empty current password', async () => {
    setUser(false);
    render(<ProfileSettings />);

    expect(screen.getByRole('heading', { name: 'Set a Password' })).toBeInTheDocument();
    // Parity: the button must not still say "Change Password" under a "Set a Password" heading.
    expect(screen.getByRole('button', { name: 'Set Password' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Current Password')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'Passw0rdSet!' } });
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: 'Passw0rdSet!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));

    await waitFor(() =>
      expect(authService.changePassword).toHaveBeenCalledWith('', 'Passw0rdSet!')
    );
  });

  it('still demands the current password for an account that has one', () => {
    setUser(true);
    render(<ProfileSettings />);
    expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
  });

  it('treats an absent hasPassword as "has one" so a stale API never hides the field', () => {
    setUser(undefined);
    render(<ProfileSettings />);
    expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
  });
});
