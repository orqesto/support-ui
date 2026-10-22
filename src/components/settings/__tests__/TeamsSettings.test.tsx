/**
 * Settings › Teams: every team with an on/off switch, a rename field; the plan
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
vi.mock('@/hooks/useCurrentWorkspace', () => ({
  useCurrentWorkspace: () => ({ id: 1, name: 'Acme Workspace', code: 'acme' }),
}));
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
  waitForTeamsSwitch: vi.fn(),
  getPlanTeamLimit: vi.fn(),
  getTeamsMode: vi.fn(),
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
    waitForTeamsSwitch: svc.waitForTeamsSwitch,
    getPlanTeamLimit: svc.getPlanTeamLimit,
    getTeamsMode: svc.getTeamsMode,
  },
}));

const { TeamsSettings } = await import('../TeamsSettings');

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

const typeName = (dialog: HTMLElement) =>
  fireEvent.change(within(dialog).getByLabelText(/To confirm, type the workspace name/), {
    target: { value: 'Acme Workspace' },
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
  svc.getPlanTeamLimit.mockResolvedValue(999999);
  svc.getTeamsMode.mockResolvedValue({ teamsEnabled: true, switching: false, interrupted: false });
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
    // Creating teams is hidden until team presets exist (a new team would get no routing rules).
    expect(screen.queryByRole('button', { name: /Add team/ })).toBeNull();
    expect(screen.queryByLabelText('New team')).toBeNull();
  });

  it('has no create control and never calls create', async () => {
    renderPage();
    await screen.findByLabelText('Name of Support team');
    expect(screen.queryByRole('button', { name: /Add team/ })).toBeNull();
    expect(svc.create).not.toHaveBeenCalled();
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
      inactiveTeamsSwept: 0,
      blockers: [],
      mergedIntoSameName: {},
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
      leadQualificationMovesToDefault: true,
      staysWithTeam: [{ key: 'routingRules', count: 5 }],
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
    expect(
      within(dialog).getByText(/Lead qualification will run on General team, so on all your mail\./)
    ).toBeTruthy();
    const stays = within(dialog).getByRole('list', { name: 'What stays with each team' });
    expect(within(stays).getByText('Routing rules').nextSibling?.textContent).toBe('5');
    expect(
      within(dialog).getByText(
        /comes back with its routing rules, but with no threads, tickets or knowledge base entries/
      )
    ).toBeTruthy();
    expect(svc.setTeamsMode).not.toHaveBeenCalled();

    typeName(dialog);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch teams off' }));
    await waitFor(() => expect(svc.setTeamsMode).toHaveBeenCalledWith(false));
  });

  it('CONTROL — Cancel switches nothing off', async () => {
    svc.previewTeamsOff.mockResolvedValue({
      defaultDepartment: null,
      teams: [],
      inactiveTeamsSwept: 0,
      blockers: [],
      mergedIntoSameName: {},
      teamsToMerge: 1,
      counts: {},
      membersAddedToDefault: 0,
      leadQualificationMovesToDefault: false,
      staysWithTeam: [],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Use teams' }));
    const dialog = await screen.findByRole('dialog');
    // CONTROL for the lead line: the flag is false here, so nothing is said.
    expect(within(dialog).queryByTestId('teams-off-lead-qualification')).toBeNull();
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

describe('TeamsSettings — a switch-off still running on the server', () => {
  const openAndConfirm = async () => {
    svc.previewTeamsOff.mockResolvedValue({
      defaultDepartment: { id: 1, name: 'General team' },
      teams: [],
      inactiveTeamsSwept: 0,
      blockers: [],
      mergedIntoSameName: {},
      teamsToMerge: 1,
      counts: { conversations: 3 },
      membersAddedToDefault: 0,
      leadQualificationMovesToDefault: false,
      staysWithTeam: [],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Use teams' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/1 team will be merged/);
    typeName(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch teams off' }));
    return dialog;
  };

  it('a timed-out PUT is not reported as a failure: it waits, then shows the result', async () => {
    // A bodiless axios error: the answer never arrived.
    svc.setTeamsMode.mockRejectedValue(
      Object.assign(new Error('timeout'), { isAxiosError: true, code: 'ECONNABORTED' })
    );
    svc.waitForTeamsSwitch.mockResolvedValue({ teamsEnabled: false, switching: false });
    const { toast } = await import('@/lib/toast');
    const dialog = await openAndConfirm();
    await waitFor(() => expect(svc.waitForTeamsSwitch).toHaveBeenCalled());
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Teams are off. Everything is now in one team.')
    );
    expect(within(dialog).queryByText(/Could not switch teams off/)).toBeNull();
  });

  it('409 TEAMS_SWITCH_IN_PROGRESS waits too; a switch that ended with teams still on says so', async () => {
    svc.setTeamsMode.mockRejectedValue(
      refused(
        409,
        'Teams are already being switched for this workspace.',
        'TEAMS_SWITCH_IN_PROGRESS'
      )
    );
    svc.waitForTeamsSwitch.mockResolvedValue({ teamsEnabled: true, switching: false });
    const dialog = await openAndConfirm();
    expect(await within(dialog).findByText('Teams were not switched off. Try again.')).toBeTruthy();
  });

  it('CONTROL: any other refusal is shown at once and nothing waits', async () => {
    svc.setTeamsMode.mockRejectedValue(
      refused(409, 'This workspace has no active team to keep.', 'CONFLICT')
    );
    const dialog = await openAndConfirm();
    expect(
      await within(dialog).findByText('This workspace has no active team to keep.')
    ).toBeTruthy();
    expect(svc.waitForTeamsSwitch).not.toHaveBeenCalled();
  });
});

describe('TeamsSettings — a plan with one team', () => {
  it('teams off on a one-team plan: the switch is disabled and says why', async () => {
    svc.mode = false;
    svc.teams = [team(1, 'General team', { isDefault: true })];
    svc.getPlanTeamLimit.mockResolvedValue(1);
    renderPage();
    expect(
      await screen.findByText('Your plan includes one team. Upgrade to use teams.')
    ).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Use teams' })).toBeDisabled();
  });

  it('CONTROL: a paid plan keeps the switch enabled', async () => {
    svc.mode = false;
    svc.teams = [team(1, 'General team', { isDefault: true })];
    renderPage();
    await waitFor(() => expect(svc.getPlanTeamLimit).toHaveBeenCalled());
    expect(await screen.findByRole('switch', { name: 'Use teams' })).not.toBeDisabled();
    expect(screen.queryByTestId('teams-plan-limit')).toBeNull();
  });
});

describe('TeamsSettings — a switch-off that did not finish', () => {
  it('interrupted: says so, blocks adding, and Finish now resumes it with PUT { enabled: false }', async () => {
    svc.getTeamsMode.mockResolvedValue({ teamsEnabled: true, switching: true, interrupted: true });
    svc.setTeamsMode.mockResolvedValue({ teamsEnabled: false });
    renderPage();
    expect(await screen.findByText('Switching teams off didn’t finish')).toBeTruthy();
    expect(screen.getByText(/you cannot switch a team on/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Use teams' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish switching off' }));
    // Finish only completes a switch already confirmed: no dialog, no typed name.
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(svc.setTeamsMode).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.queryByText('Switching teams off didn’t finish')).toBeNull());
  });

  it('interrupted: "Keep teams on" sends PUT { enabled: true }', async () => {
    svc.getTeamsMode.mockResolvedValue({ teamsEnabled: true, switching: true, interrupted: true });
    svc.setTeamsMode.mockResolvedValue({ teamsEnabled: true });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Keep teams on' }));
    await waitFor(() => expect(svc.setTeamsMode).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.queryByText('Switching teams off didn’t finish')).toBeNull());
  });

  it('#6: a switch-off that fails part-way shows Finish / Keep teams on at once, no reload', async () => {
    svc.previewTeamsOff.mockResolvedValue({
      defaultDepartment: { id: 1, name: 'General team' },
      teams: [],
      inactiveTeamsSwept: 0,
      blockers: [],
      mergedIntoSameName: {},
      teamsToMerge: 1,
      counts: { conversations: 2 },
      membersAddedToDefault: 0,
      leadQualificationMovesToDefault: false,
      staysWithTeam: [],
    });
    svc.setTeamsMode.mockRejectedValue(
      Object.assign(new Error('boom'), {
        status: 500,
        data: { success: false, error: 'Internal error' },
      })
    );
    // On mount nothing is running; after the failed PUT the backend reports it interrupted.
    svc.getTeamsMode
      .mockResolvedValueOnce({ teamsEnabled: true, switching: false, interrupted: false })
      .mockResolvedValue({ teamsEnabled: true, switching: true, interrupted: true });
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Use teams' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/1 team will be merged/);
    typeName(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch teams off' }));
    expect(await screen.findByText('Switching teams off didn’t finish')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish switching off' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep teams on' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('running elsewhere: shows it is running, waits, and does not offer Finish now', async () => {
    svc.getTeamsMode.mockResolvedValue({ teamsEnabled: true, switching: true, interrupted: false });
    svc.waitForTeamsSwitch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(await screen.findByText(/Teams are being switched off/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish switching off' })).toBeNull();
    expect(svc.waitForTeamsSwitch).toHaveBeenCalled();
  });

  it('CONTROL: nothing running shows neither', async () => {
    renderPage();
    await screen.findByLabelText('Name of General team');
    await waitFor(() => expect(svc.getTeamsMode).toHaveBeenCalled());
    expect(screen.queryByText('Switching teams off didn’t finish')).toBeNull();
    expect(screen.queryByText(/Teams are being switched off/)).toBeNull();
  });
});

describe('TeamsSettings — what stops a switch-off', () => {
  const preview = (extra: Record<string, unknown>) => ({
    defaultDepartment: { id: 1, name: 'General team' },
    teams: [],
    inactiveTeamsSwept: 0,
    teamsToMerge: 1,
    counts: { conversations: 2 },
    membersAddedToDefault: 0,
    leadQualificationMovesToDefault: false,
    staysWithTeam: [],
    blockers: [],
    mergedIntoSameName: {},
    ...extra,
  });

  it('a blocker is listed and the confirm is disabled', async () => {
    svc.previewTeamsOff.mockResolvedValue(
      preview({
        blockers: [
          {
            kind: 'ticketingIntegration',
            teamId: 3,
            teamName: 'Sales',
            integrationName: 'Sales Jira',
          },
        ],
      })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Use teams' }));
    const dialog = await screen.findByRole('dialog');
    const line = await within(dialog).findByText(
      /Team Sales has its own ticket system connection Sales Jira/
    );
    expect(line.textContent).toContain(
      "Remove or disable it, or replace General team's own with it"
    );
    expect(within(dialog).getByRole('button', { name: 'Switch teams off' })).toBeDisabled();
  });

  it('CONTROL: no blockers ⇒ the confirm is enabled; same-name merges are said', async () => {
    svc.previewTeamsOff.mockResolvedValue(
      preview({ mergedIntoSameName: { labels: 2, categories: 1 } })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Use teams' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(
        /2 labels and 1 category with the same name as one in General team are merged into it/
      )
    ).toBeTruthy();
    typeName(dialog);
    expect(within(dialog).getByRole('button', { name: 'Switch teams off' })).not.toBeDisabled();
  });

  it('409 TEAMS_SWITCH_BLOCKED shows its message and waits for nothing', async () => {
    svc.previewTeamsOff.mockResolvedValue(preview({}));
    svc.setTeamsMode.mockRejectedValue(
      refused(
        409,
        'Team Sales has its own Jira connection. Remove or move it first.',
        'TEAMS_SWITCH_BLOCKED'
      )
    );
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Use teams' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/1 team will be merged/);
    typeName(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch teams off' }));
    expect(
      await within(dialog).findByText(
        'Team Sales has its own Jira connection. Remove or move it first.'
      )
    ).toBeTruthy();
    expect(svc.waitForTeamsSwitch).not.toHaveBeenCalled();
  });
});
