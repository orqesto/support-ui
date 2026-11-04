import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { NotificationSettings, SettingsLine } from '@/services/notificationSettingsService';
import { isInactive } from '@/test/inactive';

const fetchSettings = vi.fn<() => Promise<NotificationSettings>>();
const saveSettings = vi.fn<(lines: Record<string, unknown>) => Promise<unknown>>();
const resetSettings = vi.fn<(keys?: string[]) => Promise<NotificationSettings>>();
vi.mock('@/services/notificationSettingsService', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchNotificationSettings: () => fetchSettings(),
  saveNotificationSettings: (lines: Record<string, unknown>) => saveSettings(lines),
  resetNotificationSettings: (keys?: string[]) => resetSettings(keys),
}));
const get = vi.fn<(url: string) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string) => get(url), put: vi.fn(() => Promise.resolve({ data: {} })) },
}));

const { NotificationPreferencesSettings } = await import('../NotificationPreferencesSettings');

const line = (key: string, patch: Partial<SettingsLine> = {}): SettingsLine => ({
  key,
  value: true,
  default: true,
  source: 'role_default',
  locked: false,
  alwaysOn: false,
  ...patch,
});
const settings = (lines: SettingsLine[], legacy = false): NotificationSettings => ({
  role: 'support',
  lines,
  legacy,
});
const rowSwitch = (label: string) => {
  const row = screen.getByText(label).closest('[data-line-row]');
  if (!row) throw new Error('row missing');
  return within(row as HTMLElement).getByRole('switch');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notification preferences: lines', () => {
  it('a locked line is disabled and says Set by your admin', async () => {
    fetchSettings.mockResolvedValue(
      settings([line('kind:conversation_reopened', { locked: true, source: 'locked' })])
    );
    render(<NotificationPreferencesSettings />);
    await screen.findByText('Set by your admin');
    const toggle = rowSwitch('Thread reopened');
    expect(isInactive(toggle)).toBe(true);
    fireEvent.click(toggle);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('an always-on line cannot be switched off', async () => {
    fetchSettings.mockResolvedValue(
      settings([line('kind:conversation_assigned', { alwaysOn: true, source: 'always_on' })])
    );
    render(<NotificationPreferencesSettings />);
    await screen.findByText('Always on');
    const toggle = rowSwitch('Assigned to me');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('Reset to default calls reset with that key', async () => {
    fetchSettings.mockResolvedValue(
      settings([line('kind:conversation_reopened', { value: false, source: 'own' })])
    );
    resetSettings.mockResolvedValue(settings([line('kind:conversation_reopened')]));
    render(<NotificationPreferencesSettings />);
    fireEvent.click(await screen.findByText('Reset to default'));
    await waitFor(() => expect(resetSettings).toHaveBeenCalledWith(['kind:conversation_reopened']));
  });

  it('switching a line saves just that line', async () => {
    fetchSettings.mockResolvedValue(settings([line('kind:conversation_reopened')]));
    saveSettings.mockResolvedValue(
      settings([line('kind:conversation_reopened', { value: false, source: 'own' })])
    );
    render(<NotificationPreferencesSettings />);
    await screen.findByText('Thread reopened');
    fireEvent.click(rowSwitch('Thread reopened'));
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({ 'kind:conversation_reopened': false })
    );
  });

  it('old BE renders today’s switches without crashing', async () => {
    fetchSettings.mockResolvedValue(settings([line('kind:new_unassigned_message')], true));
    get.mockResolvedValue({ data: { data: { notifyNewUnassigned: true } } });
    render(<NotificationPreferencesSettings />);
    expect(await screen.findByText('New unassigned threads')).toBeTruthy();
    expect(screen.getByText('Thread SLA')).toBeTruthy();
  });

  it('an unknown key from a newer BE shows a fallback label', async () => {
    fetchSettings.mockResolvedValue(settings([line('kind:brand_new_thing')]));
    render(<NotificationPreferencesSettings />);
    expect(await screen.findByText('Brand new thing')).toBeTruthy();
  });

  it('a 409 shows which lines are set by the admin and reloads', async () => {
    fetchSettings.mockResolvedValue(settings([line('kind:conversation_reopened')]));
    saveSettings.mockResolvedValue({ lockedKeys: ['kind:conversation_reopened'] });
    render(<NotificationPreferencesSettings />);
    await screen.findByText('Thread reopened');
    fireEvent.click(rowSwitch('Thread reopened'));
    const notice = await screen.findByText(/Set by your admin: Thread reopened/);
    expect(notice).toBeTruthy();
  });

  it('minimum priority appears only when the line exists', async () => {
    fetchSettings.mockResolvedValue(settings([line('kind:conversation_reopened')]));
    const first = render(<NotificationPreferencesSettings />);
    await screen.findByText('Thread reopened');
    expect(screen.queryByText('Minimum priority')).toBeNull();
    first.unmount();
    fetchSettings.mockResolvedValue(settings([line('minPriority', { value: 'low' })]));
    render(<NotificationPreferencesSettings />);
    expect(await screen.findByText('Minimum priority')).toBeTruthy();
  });

  it('working hours: Always is on when the value is null, and empty days are not sent', async () => {
    fetchSettings.mockResolvedValue(settings([line('workingHours', { value: null, default: null })]));
    saveSettings.mockImplementation((lines) =>
      Promise.resolve(settings([line('workingHours', { value: lines.workingHours, source: 'own' })]))
    );
    render(<NotificationPreferencesSettings />);
    const always = await screen.findByRole('switch', { name: 'Always' });
    expect(always.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(always);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    const sent = saveSettings.mock.calls[0][0].workingHours as { days: number[] };
    expect(sent.days.length).toBeGreaterThan(0);
    for (const name of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      fireEvent.click(await screen.findByRole('switch', { name }));
    }
    expect(await screen.findByText('Pick at least one day.')).toBeTruthy();
    for (const call of saveSettings.mock.calls) {
      expect((call[0].workingHours as { days: number[] }).days.length).toBeGreaterThan(0);
    }
  });
});
