import { describe, expect, it } from 'vitest';
import { matchesPrefs, type SLABreachNotification, type UserPrefs } from '../useSLANotifications';

const breach = (
  type: SLABreachNotification['type']
): Omit<SLABreachNotification, 'receivedAt'> => ({
  id: 1,
  entityId: 7,
  type,
  organizationId: 1,
  severity: 'warning',
  breachAmount: 5,
  details: {},
  createdAt: '2026-10-23T10:00:00Z',
  isRead: false,
});
const prefs = (overrides: Partial<UserPrefs>): UserPrefs => ({
  minSeverity: 'warning',
  notifyMessages: true,
  notifyTicketFirstResponse: true,
  notifyTicketResolution: true,
  onlyAssignedToMe: false,
  ...overrides,
});

describe('SLA bell preferences cover every breach type', () => {
  it('mutes a thread breach sent as `conversation` like one sent as `message`', () => {
    const off = prefs({ notifyMessages: false });
    expect(matchesPrefs(breach('message'), off)).toBe(false);
    expect(matchesPrefs(breach('conversation'), off)).toBe(false);
    // CONTROL: with thread alerts on, both show.
    expect(matchesPrefs(breach('conversation'), prefs({}))).toBe(true);
  });

  it('mutes a plain `ticket` breach only when both ticket kinds are off', () => {
    expect(
      matchesPrefs(
        breach('ticket'),
        prefs({ notifyTicketFirstResponse: false, notifyTicketResolution: false })
      )
    ).toBe(false);
    expect(matchesPrefs(breach('ticket'), prefs({ notifyTicketFirstResponse: false }))).toBe(true);
  });
});
