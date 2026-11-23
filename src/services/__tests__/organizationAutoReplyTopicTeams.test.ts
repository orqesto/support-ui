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
 * `restrictedTopicTeams`. The service hands the restricted-topics fields on AS SENT and invents
 * nothing; only the settings page reads them, and it checks their shape there (a missing or
 * malformed list reads as null, "not listed" — restrictedTopicReaders.test.ts), so that code
 * stays out of the main bundle.
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

  it('an older backend (no field): nothing invented, and the topics it does send are kept', async () => {
    get.mockResolvedValue(reply(SETTINGS));
    const settings = await organizationService.getAutoReply();
    expect(settings.restrictedTopicTeams).toBeUndefined();
    expect(settings.doseRule).toBeUndefined();
    expect(settings.restrictedTopics).toEqual(['refund disputes']);
  });

  it('no settings at all (an empty answer): the defaults, and no topics field', async () => {
    get.mockResolvedValue({ data: { success: true } });
    const settings = await organizationService.getAutoReply();
    expect(settings.enabled).toBe(false);
    expect(settings.restrictedTopics).toBeUndefined();
  });
});
