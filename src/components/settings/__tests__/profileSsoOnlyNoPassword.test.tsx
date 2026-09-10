/**
 * Settings must not offer a password to an account that signs in with SSO.
 *
 * Owner decision: an IdP-provisioned member's door is SSO, so the identity provider's
 * controls (MFA, conditional access, device policy) cannot be sidestepped by a local
 * credential. The option is DISABLED, not merely hidden — the backend refuses
 * change-password for these accounts (409) — and this pins the UI half of that.
 *
 * The test is `hasPassword === false`, never `!hasPassword`: the field is absent on older
 * backend responses, and undefined must mean "assume it has one", or a stale API would
 * hide the change-password form from members who genuinely have a password. That includes
 * every ADOPTED IdP member (SCIM matched their existing email and never touched their
 * password) — they are IdP-managed and must keep the ability to rotate it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('ProfileSettings — SSO-only accounts have no password option', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows no password form at all for an SSO-only account', () => {
    setUser(false);
    render(<ProfileSettings />);

    expect(screen.getByRole('heading', { name: 'Password' })).toBeInTheDocument();
    expect(screen.getByText(/managed by your identity provider/i)).toBeInTheDocument();

    // Nothing to type and nothing to submit — the option is gone, not merely disabled-looking.
    expect(screen.queryByLabelText('Current Password')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /password/i })).not.toBeInTheDocument();
    expect(authService.changePassword).not.toHaveBeenCalled();
  });

  it('keeps the full change form for an ADOPTED IdP member, who does have a password', () => {
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
