/**
 * Profile › Email Signature edits the signature of the workspace this tab is in (one per workspace):
 * the heading names that workspace, saving sends it, and a save ends the "check your signature"
 * notice. The backend picks the workspace from the tab's X-Organization-Context, so the page sends
 * only the text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileSettings } from '../ProfileSettings';
import { useAuthStore } from '@/stores/authStore';
import { userService } from '@/services/user.service';

vi.mock('@/services/auth.service', () => ({ authService: { changePassword: vi.fn() } }));
vi.mock('@/services/user.service', () => ({
  userService: {
    getSelfSkillValues: vi.fn().mockResolvedValue({}),
    getSelfCanEditSkills: vi.fn().mockResolvedValue(false),
    getSelfSkillOptions: vi.fn().mockResolvedValue({}),
    setSelfSkillValues: vi.fn().mockResolvedValue(undefined),
    updateSelf: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getRoutingKeys: vi.fn().mockResolvedValue([]),
    getCurrent: vi.fn().mockResolvedValue({ name: 'Northwind Example' }),
  },
}));
vi.mock('../TwoFactorSettings', () => ({ TwoFactorSettings: () => null }));
vi.mock('../ActiveSessionsSettings', () => ({ ActiveSessionsSettings: () => null }));

describe('ProfileSettings — the signature of this workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 1,
        email: 'alex@example.com',
        firstName: 'Alex',
        role: 'user',
        signature: 'Alex\nOther Brand Team',
        signatureNeedsReview: true,
      },
    } as never);
  });

  it('names the workspace whose signature it edits', async () => {
    render(<ProfileSettings />);
    expect(
      await screen.findByRole('heading', { name: 'Email Signature for Northwind Example' })
    ).toBeInTheDocument();
  });

  it('saving sends the text and ends the review notice for this workspace', async () => {
    render(<ProfileSettings />);
    fireEvent.change(screen.getByDisplayValue(/Other Brand Team/), {
      target: { value: 'Alex\nNorthwind Team' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Signature' }));
    await waitFor(() =>
      expect(userService.updateSelf).toHaveBeenCalledWith({ signature: 'Alex\nNorthwind Team' })
    );
    await waitFor(() =>
      expect(useAuthStore.getState().user).toMatchObject({
        signature: 'Alex\nNorthwind Team',
        signatureNeedsReview: false,
      })
    );
  });
});
