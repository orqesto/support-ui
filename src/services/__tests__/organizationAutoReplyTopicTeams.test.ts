import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => get(...args) },
}));

import { organizationService } from '@/services/organization.service';

const reply = (data: unknown) => ({ data: { success: true, data } });
const SETTINGS = { enabled: true, mode: 'all', restrictedTopics: ['refund disputes'] };

/**
 * FE ↔ BE skew: the frontend ships on merge, the backend on a tag. A backend that knows
 * restricted topics but does not list the teams that have them answers without
 * `restrictedTopicTeams`: read as null ("not listed"), never as an empty list it did not send.
 */
describe('organizationService.getAutoReply — restrictedTopicTeams', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a backend that lists them: passed through as sent', async () => {
    const teams = [
      { departmentId: 3, name: 'Returns', active: false, restrictedTopics: ['chargebacks'] },
      { departmentId: 5, name: null, active: false, restrictedTopics: ['press requests'] },
    ];
    get.mockResolvedValue(reply({ ...SETTINGS, restrictedTopicTeams: teams }));
    const settings = await organizationService.getAutoReply();
    expect(get).toHaveBeenCalledWith('/api/organizations/auto-reply');
    expect(settings.restrictedTopicTeams).toEqual(teams);
  });

  it('an older backend (no field): null, and the topics it does send are kept', async () => {
    get.mockResolvedValue(reply(SETTINGS));
    const settings = await organizationService.getAutoReply();
    expect(settings.restrictedTopicTeams).toBeNull();
    expect(settings.restrictedTopics).toEqual(['refund disputes']);
  });

  it('a field that is not a list: null', async () => {
    get.mockResolvedValue(reply({ ...SETTINGS, restrictedTopicTeams: {} }));
    expect((await organizationService.getAutoReply()).restrictedTopicTeams).toBeNull();
  });
});
