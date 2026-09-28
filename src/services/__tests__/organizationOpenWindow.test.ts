import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const patch = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
  },
}));

import { organizationService } from '@/services/organization.service';

const reply = (data: unknown) => ({ data: { success: true, data } });

/**
 * FE ↔ BE skew: the frontend ships on merge, the backend on a tag. A backend without off support
 * answers `{ days }` alone and 400s `days: 0`, so the Off switch is offered only when the reply
 * carries `off` AND a live-mail allowance to quote in the copy.
 */
describe('organizationService open-conversation window', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a backend WITH off support: days 0 reads as off, with the allowance', async () => {
    get.mockResolvedValue(reply({ days: 0, off: true, liveMailWindowHours: 24 }));
    await expect(organizationService.getOpenConversationWindow()).resolves.toEqual({
      days: 0,
      offSupported: true,
      liveMailWindowHours: 24,
    });
  });

  it.each([
    ['an older backend ({ days } only)', { days: 14 }],
    ['off without an allowance', { days: 14, off: false }],
    ['a non-numeric allowance', { days: 14, off: false, liveMailWindowHours: '24' }],
    ['a zero allowance', { days: 14, off: false, liveMailWindowHours: 0 }],
  ])('%s: no off support', async (_label, data) => {
    get.mockResolvedValue(reply(data));
    await expect(organizationService.getOpenConversationWindow()).resolves.toEqual({
      days: 14,
      offSupported: false,
      liveMailWindowHours: null,
    });
  });

  it('a reply without days is a fault, not a default', async () => {
    get.mockResolvedValue(reply({ off: true, liveMailWindowHours: 24 }));
    await expect(organizationService.getOpenConversationWindow()).rejects.toThrow(
      'The server did not return the window'
    );
  });

  it('saving off sends days 0 and resolves with what the server stored', async () => {
    patch.mockResolvedValue(reply({ days: 0, off: true, liveMailWindowHours: 24 }));
    await expect(organizationService.updateOpenConversationWindow(0)).resolves.toEqual({
      days: 0,
      offSupported: true,
      liveMailWindowHours: 24,
    });
    expect(patch).toHaveBeenCalledWith('/api/organizations/open-conversation-window', { days: 0 });
  });
});
