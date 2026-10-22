/**
 * Settings › Teams: every team with an on/off switch, a rename field and "Add team"; the plan
 * limit's 403 message shown as the backend wrote it; and the "Use teams" switch, whose OFF is a
 * one-way merge the dialog says plainly, with the preview's counts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Department } from '@/types';

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand');
  const useAuthStore = create(() => ({ user: null, selectedOrganizationId: 1 }));
  return { useAuthStore };
});
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {}, info: () => {} } }));

const svc = vi.hoisted(() => ({
  teams: [] as Department[],
  mode: true as boolean | undefined,
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reactivate: vi.fn(),
  deactivate: vi.fn(),
  setTeamsMode: vi.fn(),
  previewTeamsOff: vi.fn(),
}));
vi.mock('@/services/department.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  departmentService: {
    getAll: (inactive?: boolean, onMode?: (on: boolean | undefined) => void) => {
      svc.getAll(inactive);
      onMode?.(svc.mode);
      return Promise.resolve(svc.teams);
    },
    create: svc.create,
    update: svc.update,
    reactivate: svc.reactivate,
    deactivate: svc.deactivate,
    setTeamsMode: svc.setTeamsMode,
    previewTeamsOff: svc.previewTeamsOff,
  },
}));

const { TeamsSettings, slugFromName } = await import('../TeamsSettings');

const team = (id: number, name: string, extra: Partial<Department> = {}): Department => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  description: null,
  color: '#3366ff',
  active: true,
  isDefault: false,
  ...extra,
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TeamsSettings />
    </QueryClientProvider>
  );

/** An axios-shaped refusal the error helpers read. */
const refused = (status: number, error: string, code: string) =>
  Object.assign(new Error(error), {
    isAxiosError: true,
    response: { status, data: { success: false, error, code } },
  });

beforeEach(() => {
  svc.teams = [
    team(1, 'General team', { isDefault: true }),
    team(2, 'Support team'),
    team(3, 'Sales team', { active: false }),
  ];
  svc.mode = true;
  Object.values(svc).forEach((value) => {
    if (typeof value === 'function' && 'mockReset' in value)
      (value as ReturnType<typeof vi.fn>).mockReset();
  });
});
afterEach(cleanup);

describe('TeamsSettings — teams on', () => {
  it('lists every team, inactive ones too, with rename fields and on/off switches; the default has no switch', async () => {
    renderPage();
    expect(await screen.findByLabelText('Name of General team')).toHaveValue('General team');
    expect(screen.getByLabelText('Name of Support team')).toBeTruthy();
    expect(screen.getByLabelText('Name of Sales team')).toBeTruthy();
    expect(svc.getAll).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('switch', { name: 'General team on or off' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Support team on or off' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('switch', { name: 'Sales team on or off' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('button', { name: /Add team/ })).toBeTruthy();
  });

  it('Add team sends the name and a slug derived from it', async () => {
    svc.create.mockResolvedValue(team(9, 'Billing team'));
    renderPage();
    fireEvent.change(await screen.findByLabelText('New team'), {
      target: { value: 'Billing team' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add team/ }));
    await waitFor(() =>
      expect(svc.create).toHaveBeenCalledWith({ name: 'Billing team', slug: 'billing-team' })
    );
  });

  it('a plan limit refusal (403) is shown exactly as the backend wrote it', async () => {
    svc.reactivate.mockRejectedValue(
      refused(403, 'Your plan includes one team. Upgrade to add another.', 'PLAN_TEAM_LIMIT')
    );
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Sales team on or off' }));
    expect(
      await screen.findByText('Your plan includes one team. Upgrade to add another.')
    ).toBeTruthy();
    expect(svc.reactivate).toHaveBeenCalledWith(3);
  });

  it('rename sends only the new name', async () => {
    svc.update.mockResolvedValue(team(2, 'Help desk'));
    renderPage();
    fireEvent.change(await screen.findByLabelText('Name of Support team'), {
      target: { value: 'Help desk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(svc.update).toHaveBeenCalledWith(2, { name: 'Help desk' }));
  });

  it('teams switched off by someone else meanwhile (409) shows the server message', async () => {
    svc.create.mockRejectedValue(
      refused(
        409,
        'Teams are switched off for this workspace. Switch teams on in Settings → Teams first.',
        'TEAMS_SWITCHED_OFF'
      )
    );
    renderPage();
    fireEvent.change(await screen.findByLabelText('New team'), {
      target: { value: 'Billing team' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add team/ }));
    expect(await screen.findByText(/Teams are switched off for this workspace/)).toBeTruthy();
  });

  it('switching one team off asks where its work goes (the default team preselected), then sends it', async () => {
    svc.deactivate.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Support team on or off' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/move to the team you choose/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(svc.deactivate).toHaveBeenCalledWith(2, 1));
  });
});

describe('TeamsSettings — the "Use teams" switch', () => {
  it('off: the dialog shows the preview counts, says it cannot be undone and that agents will see everything', async () => {
    svc.previewTeamsOff.mockResolvedValue({
      defaultDepartment: { id: 1, name: 'General team' },
      teams: [],
      teamsToMerge: 2,
      counts: {
        conversations: 120,
        tickets: 8,
        channels: 3,
        members: 4,
        kbEntries: 15,
        someNewKey: 2,
      },
      membersAddedToDefault: 3,
    });
    svc.setTeamsMode.mockResolvedValue({ teamsEnabled: false });
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Use teams' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(/2 teams will be merged into General team/)
    ).toBeTruthy();
    const moves = within(dialog).getByRole('list', { name: 'What moves' });
    expect(within(moves).getByText('Threads').nextSibling?.textContent).toBe('120');
    expect(within(moves).getByText('Tickets')).toBeTruthy();
    expect(within(moves).getByText('Channels')).toBeTruthy();
    expect(within(moves).getByText('Members')).toBeTruthy();
    expect(within(moves).getByText('Knowledge base entries')).toBeTruthy();
    // A key the FE has no label for still renders, in words.
    expect(within(moves).getByText('Some new key')).toBeTruthy();
    expect(within(dialog).getByText(/3 people are added to General team/)).toBeTruthy();
    expect(within(dialog).getByText('This can’t be undone')).toBeTruthy();
    expect(
      within(dialog).getByText(/Agents who could see only their own team will see everything/)
    ).toBeTruthy();
    expect(within(dialog).getByText(/Teams you switch on again later start empty/)).toBeTruthy();
    expect(svc.setTeamsMode).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch teams off' }));
    await waitFor(() => expect(svc.setTeamsMode).toHaveBeenCalledWith(false));
  });

  it('CONTROL — Cancel switches nothing off', async () => {
    svc.previewTeamsOff.mockResolvedValue({
      defaultDepartment: null,
      teams: [],
      teamsToMerge: 1,
      counts: {},
      membersAddedToDefault: 0,
    });
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Use teams' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(svc.setTeamsMode).not.toHaveBeenCalled();
  });

  it('teams off: no team switches and no Add team; the switch turns teams on with one call', async () => {
    svc.mode = false;
    svc.teams = [
      team(1, 'General team', { isDefault: true }),
      team(2, 'Support team', { active: false }),
    ];
    svc.setTeamsMode.mockResolvedValue({ teamsEnabled: true });
    renderPage();
    expect(await screen.findByText(/Teams are off. Everything is in General team/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add team/ })).toBeNull();
    expect(screen.queryByLabelText('Name of Support team')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Use teams' }));
    await waitFor(() => expect(svc.setTeamsMode).toHaveBeenCalledWith(true));
  });
});

describe('slugFromName', () => {
  it('lowercases, dashes and strips accents; never collides with a taken slug', () => {
    expect(slugFromName('Kundenservice Ö', [])).toBe('kundenservice-o');
    expect(slugFromName('Support team', ['support-team'])).toBe('support-team-2');
    expect(slugFromName('!!!', [])).toBe('team');
  });
});
