import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, put, post } }));

const svc = await import('../notificationSettingsService');
const { apiError } = await import('@/test/apiError');
const { matchesPrefs } = await import('@/hooks/useSLANotifications');

beforeEach(() => {
  svc.resetNotificationSettingsModeForTests();
  get.mockReset();
  put.mockReset();
  post.mockReset();
});

const legacyBody = {
  emailEnabled: false,
  digestEnabled: true,
  minSeverity: 'critical',
  notifyMessages: true,
  notifyTicketFirstResponse: true,
  notifyTicketResolution: false,
  onlyAssignedToMe: false,
  notifyNewUnassigned: false,
};
const value = (settings: { lines: { key: string; value: unknown }[] }, key: string) =>
  settings.lines.find((row) => row.key === key)?.value;

describe('fetchNotificationSettings', () => {
  it('reads the new endpoint', async () => {
    get.mockResolvedValue({
      data: {
        data: {
          role: 'support',
          lines: [
            { key: 'onlyAssignedToMe', value: true, default: false, source: 'own', locked: false, alwaysOn: false },
          ],
        },
      },
    });
    const out = await svc.fetchNotificationSettings();
    expect(get).toHaveBeenCalledWith('/api/users/me/notification-settings');
    expect(out).toMatchObject({ role: 'support', legacy: false });
    expect(out.lines).toHaveLength(1);
  });

  it('old BE without the new endpoint still yields lines', async () => {
    get.mockRejectedValueOnce(await apiError(404, { success: false, error: 'Not Found' }));
    get.mockResolvedValueOnce({ data: { data: legacyBody } });
    const out = await svc.fetchNotificationSettings();
    expect(out.legacy).toBe(true);
    expect(value(out, 'kind:new_unassigned_message')).toBe(false);
    expect(value(out, 'kind:sla_message_breach')).toBe(true);
    expect(value(out, 'kind:customer_message_on_assigned')).toBe(true);
    expect(value(out, 'kind:sla_ticket_resolution')).toBe(false);
    expect(value(out, 'slaMinSeverity')).toBe('critical');
    expect(out.lines.some((row) => /email|digest/i.test(row.key))).toBe(false);
    expect(out.lines.every((row) => !row.locked)).toBe(true);
  });

  it('does not fall back on a 500', async () => {
    get.mockRejectedValue(await apiError(500, { success: false }));
    await expect(svc.fetchNotificationSettings()).rejects.toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('normaliseSettings', () => {
  it('tolerates a response with no lines', () => {
    expect(svc.normaliseSettings({}).lines).toEqual([]);
    expect(svc.normaliseSettings(null).lines).toEqual([]);
  });
  it('keeps unknown keys and fills missing fields', () => {
    const out = svc.normaliseSettings({ lines: [{ key: 'kind:future_thing', value: 3 }, 'junk'] });
    expect(out.lines).toEqual([
      { key: 'kind:future_thing', value: 3, default: null, source: 'code_default', locked: false, alwaysOn: false },
    ]);
    expect(out.role).toBeNull();
  });
});

describe('saveNotificationSettings', () => {
  it('PUTs the lines and returns the new settings', async () => {
    put.mockResolvedValue({ data: { data: { role: 'support', lines: [] } } });
    get.mockResolvedValue({ data: { data: { role: 'support', lines: [] } } });
    await svc.fetchNotificationSettings();
    const res = await svc.saveNotificationSettings({ onlyAssignedToMe: true });
    expect(put).toHaveBeenCalledWith('/api/users/me/notification-settings', { lines: { onlyAssignedToMe: true } });
    expect(res).toMatchObject({ role: 'support' });
  });

  it('surfaces locked keys from a 409', async () => {
    get.mockResolvedValue({ data: { data: { role: 'support', lines: [] } } });
    await svc.fetchNotificationSettings();
    put.mockRejectedValue(await apiError(409, { code: 'LINE_LOCKED', keys: ['onlyAssignedToMe'] }));
    await expect(svc.saveNotificationSettings({ onlyAssignedToMe: true })).resolves.toEqual({
      lockedKeys: ['onlyAssignedToMe'],
    });
  });

  it('other save errors still throw', async () => {
    get.mockResolvedValue({ data: { data: { role: 'support', lines: [] } } });
    await svc.fetchNotificationSettings();
    put.mockRejectedValue(await apiError(400, { code: 'BAD' }));
    await expect(svc.saveNotificationSettings({ onlyAssignedToMe: true })).rejects.toBeTruthy();
  });

  it('legacy mode PUTs the legacy shape, keeps email/digest, maps back', async () => {
    get.mockRejectedValueOnce(await apiError(404, {}));
    get.mockResolvedValueOnce({ data: { data: legacyBody } });
    await svc.fetchNotificationSettings();
    get.mockResolvedValueOnce({ data: { data: legacyBody } }); // read-modify-write
    put.mockResolvedValue({ data: { data: { ...legacyBody, notifyNewUnassigned: true } } });
    const res = await svc.saveNotificationSettings({ 'kind:new_unassigned_message': true, slaMinSeverity: 'warning' });
    const sent = put.mock.calls[0];
    expect(sent[0]).toBe('/api/users/me/notification-preferences');
    expect(sent[1]).toMatchObject({ emailEnabled: false, digestEnabled: true, notifyNewUnassigned: true, minSeverity: 'warning' });
    expect(value(res as never, 'kind:new_unassigned_message')).toBe(true);
  });

  it('legacy 409 returns lockedKeys', async () => {
    get.mockRejectedValueOnce(await apiError(404, {}));
    get.mockResolvedValueOnce({ data: { data: legacyBody } });
    await svc.fetchNotificationSettings();
    get.mockResolvedValueOnce({ data: { data: legacyBody } });
    put.mockRejectedValue(await apiError(409, { code: 'LINE_LOCKED', keys: ['onlyAssignedToMe'], fields: ['onlyAssignedToMe'] }));
    await expect(svc.saveNotificationSettings({ onlyAssignedToMe: true })).resolves.toEqual({
      lockedKeys: ['onlyAssignedToMe'],
    });
  });
});

describe('resetNotificationSettings', () => {
  it('POSTs the keys', async () => {
    get.mockResolvedValue({ data: { data: { role: 'support', lines: [] } } });
    await svc.fetchNotificationSettings();
    post.mockResolvedValue({ data: { data: { role: 'support', lines: [] } } });
    await svc.resetNotificationSettings(['onlyAssignedToMe']);
    expect(post).toHaveBeenCalledWith('/api/users/me/notification-settings/reset', { keys: ['onlyAssignedToMe'] });
  });
});

describe('matchesPrefs with effective lines', () => {
  const prefs = {
    minSeverity: 'warning' as const,
    notifyMessages: true,
    notifyTicketFirstResponse: true,
    notifyTicketResolution: true,
    onlyAssignedToMe: false,
  };
  const breach = {
    id: 1, entityId: 1, type: 'message' as const, organizationId: 1, severity: 'warning' as const,
    breachAmount: 1, details: {}, createdAt: '', isRead: false,
  };
  const line = (key: string, val: unknown) => ({ key, value: val, default: val, source: 'own' as const, locked: false, alwaysOn: false });

  it('hides a kind that is OFF', () => {
    expect(matchesPrefs(breach, prefs, [line('kind:sla_message_breach', false)])).toBe(false);
  });
  it('keeps today behaviour when lines are absent or the kind is not listed', () => {
    expect(matchesPrefs(breach, prefs)).toBe(true);
    expect(matchesPrefs(breach, prefs, [])).toBe(true);
    expect(matchesPrefs(breach, prefs, [line('kind:sla_message_breach', true)])).toBe(true);
  });
});

describe('old backend costs one 404 per session', () => {
  it('after the first 404 the next reads go straight to the legacy GET, and re-probe after 10 minutes', async () => {
    vi.useFakeTimers();
    try {
      get.mockRejectedValueOnce(await apiError(404, {}));
      get.mockResolvedValue({ data: { data: legacyBody } });
      await svc.fetchNotificationSettings();
      await svc.fetchNotificationSettings();
      await svc.fetchNotificationSettings();
      const urls = get.mock.calls.map((call) => String(call[0]));
      expect(urls.filter((url) => url === '/api/users/me/notification-settings')).toHaveLength(1);
      expect(urls.filter((url) => url === '/api/users/me/notification-preferences')).toHaveLength(3);
      vi.advanceTimersByTime(10 * 60_000 + 1);
      get.mockReset();
      get.mockResolvedValueOnce({ data: { data: { role: 'support', lines: [] } } });
      const upgraded = await svc.fetchNotificationSettings();
      expect(get.mock.calls[0][0]).toBe('/api/users/me/notification-settings');
      expect(upgraded.legacy).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchRoleDefaults on an older backend', () => {
  it.each([400, 403, 404])('reads %s as unavailable, not an error', async (status) => {
    get.mockRejectedValueOnce(await apiError(status, { success: false }));
    expect(await svc.fetchRoleDefaults()).toBeNull();
  });

  it('CONTROL: a 500 is still an error', async () => {
    get.mockRejectedValueOnce(await apiError(500, { success: false }));
    await expect(svc.fetchRoleDefaults()).rejects.toBeTruthy();
  });
});
