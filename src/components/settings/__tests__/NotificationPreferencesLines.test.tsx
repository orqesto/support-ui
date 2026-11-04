import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { NotificationSettings, SettingsLine } from '@/services/notificationSettingsService';
import { isInactive } from '@/test/inactive';
import { useAuthStore } from '@/stores/authStore';

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
    // The hook already read the old preferences: the legacy form must not GET them again.
    expect(get).not.toHaveBeenCalled();
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
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1), { timeout: 2000 });
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

  it('a badge is tied to its switch for screen readers', async () => {
    fetchSettings.mockResolvedValue(
      settings([line('kind:conversation_reopened', { locked: true, source: 'locked' })])
    );
    render(<NotificationPreferencesSettings />);
    const badge = await screen.findByText('Set by your admin');
    const id = rowSwitch('Thread reopened').getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toBe(badge.textContent);
  });
});

describe('notification preferences: save ordering and local state', () => {
  const deferred = () => {
    let resolve!: (val: unknown) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  const reopened = (value: boolean) =>
    settings([line('kind:conversation_reopened', { value, source: 'own' })]);

  it('two quick toggles with the older reply last end on the newer value, with no flash', async () => {
    fetchSettings.mockResolvedValue(settings([line('kind:conversation_reopened')]));
    const first = deferred();
    const second = deferred();
    saveSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<NotificationPreferencesSettings />);
    await screen.findByText('Thread reopened');
    fireEvent.click(rowSwitch('Thread reopened')); // off
    fireEvent.click(rowSwitch('Thread reopened')); // on again
    expect(rowSwitch('Thread reopened').getAttribute('aria-checked')).toBe('true');
    second.resolve(reopened(true));
    await waitFor(() => expect(rowSwitch('Thread reopened').getAttribute('aria-checked')).toBe('true'));
    first.resolve(reopened(false));
    await new Promise((done) => setTimeout(done, 20));
    expect(rowSwitch('Thread reopened').getAttribute('aria-checked')).toBe('true');
  });

  it('the older reply arriving first does not flash the switch back while the newer one is in flight', async () => {
    fetchSettings.mockResolvedValue(settings([line('kind:conversation_reopened')]));
    const first = deferred();
    const second = deferred();
    saveSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<NotificationPreferencesSettings />);
    await screen.findByText('Thread reopened');
    fireEvent.click(rowSwitch('Thread reopened'));
    fireEvent.click(rowSwitch('Thread reopened'));
    first.resolve(reopened(false));
    await new Promise((done) => setTimeout(done, 20));
    expect(rowSwitch('Thread reopened').getAttribute('aria-checked')).toBe('true');
    second.resolve(reopened(true));
  });

  it('a failed latest save reverts the switch', async () => {
    fetchSettings.mockResolvedValue(settings([line('kind:conversation_reopened')]));
    saveSettings.mockRejectedValueOnce(new Error('500'));
    render(<NotificationPreferencesSettings />);
    await screen.findByText('Thread reopened');
    fireEvent.click(rowSwitch('Thread reopened'));
    await screen.findByText('Could not save that change.');
    expect(rowSwitch('Thread reopened').getAttribute('aria-checked')).toBe('true');
  });

  const hoursLine = (days: number[]) =>
    line('workingHours', {
      value: { days, start: '09:00', end: '17:00', timeZone: 'UTC' },
      default: null,
      source: 'own',
    });

  it('a workspace switch shows the new workspace hours, not the old draft', async () => {
    useAuthStore.setState({ selectedOrganizationId: 1 });
    fetchSettings.mockResolvedValueOnce(settings([hoursLine([1, 2, 3])]));
    render(<NotificationPreferencesSettings />);
    const monday = await screen.findByRole('switch', { name: 'Mon' });
    fireEvent.click(monday); // draft: Mon off (not yet saved)
    expect(screen.getByRole('switch', { name: 'Mon' }).getAttribute('aria-checked')).toBe('false');
    fetchSettings.mockResolvedValueOnce(settings([hoursLine([6])]));
    useAuthStore.setState({ selectedOrganizationId: 2 });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Sat' }).getAttribute('aria-checked')).toBe('true')
    );
    expect(screen.getByRole('switch', { name: 'Mon' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('switch', { name: 'Tue' }).getAttribute('aria-checked')).toBe('false');
    // And the old draft was dropped, never sent to workspace 2.
    await new Promise((done) => setTimeout(done, 800));
    expect(saveSettings).not.toHaveBeenCalled();
    useAuthStore.setState({ selectedOrganizationId: null });
  });

  it('working hours save once after typing pauses, with the last value', async () => {
    fetchSettings.mockResolvedValue(settings([hoursLine([1])]));
    saveSettings.mockImplementation((lines) =>
      Promise.resolve(settings([line('workingHours', { value: lines.workingHours, source: 'own' })]))
    );
    render(<NotificationPreferencesSettings />);
    const from = await screen.findByLabelText('From');
    fireEvent.change(from, { target: { value: '10:00' } });
    fireEvent.change(from, { target: { value: '10:30' } });
    expect(saveSettings).not.toHaveBeenCalled();
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect((saveSettings.mock.calls[0][0].workingHours as { start: string }).start).toBe('10:30');
  });

  it('after a successful save the draft gives way to the server value', async () => {
    fetchSettings.mockResolvedValue(settings([hoursLine([1])]));
    saveSettings.mockResolvedValue(settings([hoursLine([1, 2])])); // the server clamps/normalises
    render(<NotificationPreferencesSettings />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Wed' }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Wed' }).getAttribute('aria-checked')).toBe('false')
    );
    expect(screen.getByRole('switch', { name: 'Tue' }).getAttribute('aria-checked')).toBe('true');
  });
});
