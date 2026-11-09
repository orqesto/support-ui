import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const setSkillValues = vi.fn<(userId: number, key: string, values: string[]) => Promise<void>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getRoutingKeys: () => Promise.resolve([{ id: 1, key: 'payment_sys', description: null, type: 'topic' }]),
    getRoutingKeyValues: () =>
      Promise.resolve([
        { value: 'usdc', description: null, holders: 1, unused: false, reassigned30d: 0, knownLanguage: null },
        { value: 'usdt', description: null, holders: 1, unused: false, reassigned30d: 0, knownLanguage: null },
      ]),
  },
}));
vi.mock('@/services/user.service', () => ({
  userService: {
    getSkillValues: () => Promise.resolve({ payment_sys: ['usdt'] }),
    getCanEditSkills: () => Promise.resolve(false),
    setSkillValues: (userId: number, key: string, values: string[]) => setSkillValues(userId, key, values),
    setCanEditSkills: vi.fn(),
  },
}));

import { UserRoutingSkillsCard } from '../UserRoutingSkillsCard';

describe('UserRoutingSkillsCard — pick a value colleagues already use', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkillValues.mockResolvedValue();
  });

  it('one click adds the workspace’s spelling of the value', async () => {
    render(<UserRoutingSkillsCard userId={5} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add usdc' }));
    await waitFor(() => expect(setSkillValues).toHaveBeenCalledWith(5, 'payment_sys', ['usdt', 'usdc']));
  });
});
