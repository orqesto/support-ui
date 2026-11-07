import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { User } from '@/types';

const setSkillValues = vi.fn<(userId: number, key: string, values: string[]) => Promise<void>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getRoutingKeys: () => Promise.resolve([{ id: 1, key: 'lang', description: null, type: 'language' }]),
    getRoutingKeyValues: () => Promise.resolve([]),
    getSelfEditSkills: () => Promise.resolve({ allowSelfEditSkills: false }),
  },
}));
vi.mock('@/services/user.service', () => ({
  userService: {
    getSkillValues: () => Promise.resolve({ lang: ['english'] }),
    getCanEditSkills: () => Promise.resolve(false),
    setSkillValues: (userId: number, key: string, values: string[]) => setSkillValues(userId, key, values),
    setCanEditSkills: vi.fn(),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { UserSkillsModal } from '../UserSkillsModal';

describe('UserSkillsModal — a Language key offers languages by name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkillValues.mockResolvedValue();
  });

  it('one click adds Spanish', async () => {
    render(<UserSkillsModal isOpen onClose={vi.fn()} user={{ id: 5, firstName: 'Ada', lastName: 'Example' } as User} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add spanish' }));
    await waitFor(() => expect(setSkillValues).toHaveBeenCalledWith(5, 'lang', ['english', 'spanish']));
  });
});
