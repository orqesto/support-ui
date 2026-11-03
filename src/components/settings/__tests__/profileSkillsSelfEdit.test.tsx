/**
 * An agent's own routing skills on Profile (review 2026-11-03): a save the backend refuses goes
 * back to what was saved and says why (it used to keep the unsaved value on screen silently),
 * and the workspace's existing values are offered to click — agents pick, they do not invent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';

const setSelfSkillValues = vi.fn<(key: string, values: string[]) => Promise<void>>();
vi.mock('@/services/auth.service', () => ({ authService: { changePassword: vi.fn() } }));
vi.mock('@/services/user.service', () => ({
  userService: {
    getCurrentUser: vi.fn().mockResolvedValue({ id: 1, email: 'a@x.test', hasPassword: true }),
    getSelfSkillValues: vi.fn().mockResolvedValue({ payment_sys: ['usdt'] }),
    getSelfCanEditSkills: vi.fn().mockResolvedValue(true),
    getSelfSkillOptions: vi.fn().mockResolvedValue({ payment_sys: ['usdc', 'usdt'] }),
    setSelfSkillValues: (key: string, values: string[]) => setSelfSkillValues(key, values),
    updateSelf: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getRoutingKeys: vi
      .fn()
      .mockResolvedValue([{ id: 1, key: 'payment_sys', description: null }]),
    getCurrent: vi.fn().mockResolvedValue({ name: 'Example Workspace' }),
  },
}));
vi.mock('../TwoFactorSettings', () => ({ TwoFactorSettings: () => null }));
vi.mock('../ActiveSessionsSettings', () => ({ ActiveSessionsSettings: () => null }));

const { ProfileSettings } = await import('../ProfileSettings');

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: {
      id: 1,
      email: 'agent@example.test',
      firstName: 'A',
      lastName: 'Agent',
      role: 'user',
      createdAt: '2026-09-03T07:29:16.949Z',
      hasPassword: true,
    },
  } as never);
});

describe('Profile — own routing skills', () => {
  it('offers the existing values the agent does not hold, and a click saves it', async () => {
    setSelfSkillValues.mockResolvedValue();
    render(<ProfileSettings />);
    fireEvent.click(await screen.findByRole('button', { name: '+ usdc' }));
    await waitFor(() =>
      expect(setSelfSkillValues).toHaveBeenCalledWith('payment_sys', ['usdt', 'usdc'])
    );
    expect(screen.queryByRole('button', { name: '+ usdt' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a refused save goes back to what was saved and shows the reason', async () => {
    // The shape the api-client interceptor throws: status and body on the error itself.
    setSelfSkillValues.mockRejectedValue({
      status: 400,
      data: { success: false, message: "'vip' is not a value of 'payment_sys' yet." },
    });
    render(<ProfileSettings />);
    const input = await screen.findByPlaceholderText(/comma-separated/);
    fireEvent.change(input, { target: { value: 'vip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("'vip' is not a value of 'payment_sys' yet.");
    await waitFor(() => expect(screen.queryByText('vip')).toBeNull());
    expect(screen.getByText('usdt')).toBeInTheDocument();
  });

  it('one save per key at a time; a refusal rolls back to what the server confirmed', async () => {
    let refuse: (reason: unknown) => void = () => undefined;
    setSelfSkillValues.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (refuse = reject))
    );
    render(<ProfileSettings />);
    fireEvent.click(await screen.findByRole('button', { name: '+ usdc' }));
    // While the first save is out, the key's controls are locked: a second save sends nothing.
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(screen.getByPlaceholderText(/comma-separated/), { target: { value: 'busd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(setSelfSkillValues).toHaveBeenCalledTimes(1);
    refuse({ status: 400, data: { message: 'Self-edit skills not permitted' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Self-edit skills not permitted');
    await waitFor(() => expect(screen.queryByText('usdc')).toBeNull());
    expect(screen.getByText('usdt')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add' })).not.toHaveAttribute('aria-disabled', 'true')
    );
  });
});
