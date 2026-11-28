import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';
import type * as OnboardingServiceModule from '@/services/onboarding.service';

type OfferedTeam = OnboardingServiceModule.OfferedTeam;
type OnboardingTeams = OnboardingServiceModule.OnboardingTeams;
type TeamPickResult = OnboardingServiceModule.TeamPickResult;

/**
 * The teams picker, the first part of the People step ("Who answers your mail?"): General always
 * on, the offered built-in teams as tick boxes, "Save teams" applies them and unlocks the invite
 * list below. Invented data only.
 */

const teamsApi = vi.hoisted(() => ({
  get: vi.fn<() => Promise<OnboardingTeams | null>>(),
  save: vi.fn<(keys: string[]) => Promise<TeamPickResult[]>>(),
}));
vi.mock('@/services/onboarding.service', async (importOriginal) => {
  const actual = await importOriginal<typeof OnboardingServiceModule>();
  return {
    ...actual,
    getOnboardingTeams: () => teamsApi.get(),
    saveOnboardingTeams: (keys: string[]) => teamsApi.save(keys),
  };
});

const onboarding = vi.hoisted(() => ({
  current: { teamsFromPresets: true } as Record<string, unknown> | null,
}));
vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (pick: (state: { onboarding: unknown }) => unknown) =>
    pick({ onboarding: onboarding.current }),
}));

const getAllDepartments = vi.hoisted(() =>
  vi.fn((_inactive?: boolean, onMode?: (value: boolean | undefined) => void) => {
    onMode?.(true);
    return Promise.resolve([{ id: 1, name: 'General', active: true }] as unknown[]);
  })
);
vi.mock('@/services/department.service', () => ({
  departmentService: {
    getAll: (inactive?: boolean, onMode?: (value: boolean | undefined) => void) =>
      getAllDepartments(inactive, onMode),
  },
}));
vi.mock('@/services/subscription.service', () => ({
  subscriptionService: {
    getUsage: () => Promise.resolve({ current: { users: 1 }, limits: { users: 999999 } }),
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getCurrent: () => Promise.resolve({ id: 1, name: 'Example workspace' }) },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: () => Promise.resolve({ success: true, data: [] }) },
}));

const { SetupInProgressError, OnboardingCompleteError } = await import(
  '@/services/onboarding.service'
);
const { useAuthStore } = await import('@/stores/authStore');
const { TeamPresetPicker } = await import('../steps/TeamPresetPicker');
const { InviteTeamStep } = await import('../steps/InviteTeamStep');

const offer = (presetKey: string, name: string, over: Partial<OfferedTeam> = {}): OfferedTeam => ({
  presetKey,
  name,
  description: `${name} mail`,
  itemCount: 4,
  teamId: null,
  active: false,
  ...over,
});

const fresh = (over: Partial<OnboardingTeams> = {}): OnboardingTeams => ({
  offered: [offer('support', 'Support'), offer('sales', 'Sales'), offer('billing', 'Billing')],
  preTicked: ['support'],
  editable: true,
  ...over,
});

const box = (name: string) =>
  screen.getByRole<HTMLInputElement>('checkbox', { name: new RegExp(`^${name}`) });
/** A tick box (a native input, unlike Button) that cannot be changed. */
const locked = (name: string) => box(name).disabled;
const saveButton = () => screen.getByRole('button', { name: 'Save teams' });
const lockError = () => Object.assign(new Error('busy'), { code: 'PICK_LOCK_UNAVAILABLE' });

beforeEach(() => {
  teamsApi.get.mockReset();
  teamsApi.save.mockReset();
  teamsApi.get.mockResolvedValue(fresh());
  teamsApi.save.mockResolvedValue([{ presetKey: 'support', outcome: 'created', teamId: 2 }]);
  getAllDepartments.mockClear();
  onboarding.current = { teamsFromPresets: true };
  useAuthStore.setState({ selectedOrganizationId: 1 } as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TeamPresetPicker — what it shows', () => {
  it('heading, General checked and locked, Support pre-ticked, the rest unticked, no Warehouse', async () => {
    render(<TeamPresetPicker onSaved={vi.fn()} />);
    expect(
      await screen.findByRole('heading', { name: 'Which teams answer your mail?' })
    ).toBeInTheDocument();
    expect(box('General')).toBeChecked();
    expect(locked('General')).toBe(true);
    expect(box('Support')).toBeChecked();
    expect(box('Sales')).not.toBeChecked();
    expect(box('Billing')).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Warehouse/ })).toBeNull();
    // General is listed first.
    expect(screen.getAllByRole('checkbox')[0]).toBe(box('General'));
  });

  it('teams saved before: the ticks follow the teams that exist and are on, not the default', async () => {
    teamsApi.get.mockResolvedValue(
      fresh({
        offered: [
          offer('support', 'Support', { teamId: 2, active: false }),
          offer('sales', 'Sales', { teamId: 3, active: true }),
          offer('billing', 'Billing'),
        ],
      })
    );
    render(<TeamPresetPicker onSaved={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    expect(box('Support')).not.toBeChecked();
    expect(box('Sales')).toBeChecked();
    expect(box('Billing')).not.toBeChecked();
  });

  it('setup already finished: read-only, no Save, points to the Teams page', async () => {
    teamsApi.get.mockResolvedValue(
      fresh({
        editable: false,
        offered: [
          offer('support', 'Support', { teamId: 2, active: true }),
          offer('sales', 'Sales'),
        ],
      })
    );
    const onNotNeeded = vi.fn();
    render(<TeamPresetPicker onSaved={vi.fn()} onNotNeeded={onNotNeeded} />);
    expect(
      await screen.findByText('Setup is finished — change teams on the Teams page.')
    ).toBeInTheDocument();
    expect(box('Support')).toBeChecked();
    expect(locked('Support')).toBe(true);
    expect(locked('Sales')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save teams' })).toBeNull();
    expect(onNotNeeded).toHaveBeenCalled();
  });

  it('not available (null): renders nothing and says so', async () => {
    teamsApi.get.mockResolvedValue(null);
    const onNotNeeded = vi.fn();
    const { container } = render(<TeamPresetPicker onSaved={vi.fn()} onNotNeeded={onNotNeeded} />);
    await waitFor(() => expect(onNotNeeded).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TeamPresetPicker — saving', () => {
  it('sends the ticked offered keys (General is never sent) and reports the results', async () => {
    const onSaved = vi.fn();
    render(<TeamPresetPicker onSaved={onSaved} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(box('Billing'));
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(teamsApi.save).toHaveBeenCalledWith(['support', 'billing']);
  });

  it('unticking a team that exists and is on sends it left out, and shows "Switched off"', async () => {
    teamsApi.get.mockResolvedValue(
      fresh({
        offered: [
          offer('support', 'Support', { teamId: 2, active: true }),
          offer('sales', 'Sales'),
        ],
      })
    );
    teamsApi.save.mockResolvedValue([{ presetKey: 'support', outcome: 'deactivated', teamId: 2 }]);
    render(<TeamPresetPicker onSaved={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(box('Support'));
    fireEvent.click(saveButton());
    expect(await screen.findByText('Switched off')).toBeInTheDocument();
    expect(teamsApi.save).toHaveBeenCalledWith([]);
  });

  it('each result is shown next to its team; a failure does not block (onSaved still fires)', async () => {
    teamsApi.get.mockResolvedValue(
      fresh({
        offered: [
          offer('support', 'Support'),
          offer('sales', 'Sales'),
          offer('billing', 'Billing'),
          offer('hr', 'HR'),
          offer('marketing', 'Marketing'),
          offer('warehouse', 'Warehouse'),
          offer('legal', 'Legal'),
        ],
        preTicked: ['support', 'sales', 'billing', 'hr', 'marketing', 'warehouse', 'legal'],
      })
    );
    const results: TeamPickResult[] = [
      { presetKey: 'support', outcome: 'repaired', teamId: 2 },
      { presetKey: 'sales', outcome: 'failed', reason: 'PLAN_TEAM_LIMIT' },
      {
        presetKey: 'billing',
        outcome: 'failed',
        reason: 'ITEMS_FAILED',
        failedItems: 3,
        teamId: 4,
      },
      { presetKey: 'hr', outcome: 'failed', reason: 'SEED_FAILED' },
      { presetKey: 'marketing', outcome: 'failed', reason: 'TEAM_PREFIX_TAKEN' },
      { presetKey: 'warehouse', outcome: 'failed', reason: 'TEAM_NAME_TAKEN' },
      { presetKey: 'legal', outcome: 'failed', reason: 'SOMETHING_NEW' },
    ];
    teamsApi.save.mockResolvedValue(results);
    const onSaved = vi.fn();
    render(<TeamPresetPicker onSaved={onSaved} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(results));
    const row = (key: string) => screen.getByTestId(`team-row-${key}`);
    expect(within(row('support')).getByText('Fixed: missing rules added')).toBeInTheDocument();
    expect(
      within(row('sales')).getByText(
        "Your plan doesn't allow more teams. General is included; upgrade to add more."
      )
    ).toBeInTheDocument();
    expect(
      within(row('billing')).getByText("Some rules couldn't be added (3). Save again to retry.")
    ).toBeInTheDocument();
    expect(
      within(row('hr')).getByText("Couldn't add this team's rules. Save again to retry.")
    ).toBeInTheDocument();
    expect(
      within(row('marketing')).getByText('A team with this name already exists.')
    ).toBeInTheDocument();
    expect(
      within(row('warehouse')).getByText('A team with this name already exists.')
    ).toBeInTheDocument();
    expect(within(row('legal')).getByText("Couldn't set up this team.")).toBeInTheDocument();
  });

  it('created / activated / unchanged show the OK state', async () => {
    teamsApi.get.mockResolvedValue(fresh({ preTicked: ['support', 'sales', 'billing'] }));
    teamsApi.save.mockResolvedValue([
      { presetKey: 'support', outcome: 'created', teamId: 2 },
      { presetKey: 'sales', outcome: 'activated', teamId: 3 },
      { presetKey: 'billing', outcome: 'unchanged', teamId: 4 },
    ]);
    render(<TeamPresetPicker onSaved={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getAllByText('Ready')).toHaveLength(3));
  });

  it('still setting up: says so, retries every 3 s, gives up after 20 tries with a Retry button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    teamsApi.save.mockRejectedValue(new SetupInProgressError());
    const onSaved = vi.fn();
    render(<TeamPresetPicker onSaved={onSaved} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    expect(await screen.findByText('Still setting up your workspace…')).toBeInTheDocument();
    expect(teamsApi.save).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(teamsApi.save).toHaveBeenCalledTimes(2);
    for (let tick = 0; tick < 25; tick += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
    }
    expect(teamsApi.save).toHaveBeenCalledTimes(20);
    expect(screen.getByText(/Setup is taking longer than usual/)).toBeInTheDocument();
    teamsApi.save.mockResolvedValue([{ presetKey: 'support', outcome: 'created', teamId: 2 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(teamsApi.save).toHaveBeenCalledTimes(21);
  });

  it('closing the picker while it waits stops the retries (no background saves)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let rejectFirst: (error: unknown) => void = () => undefined;
    teamsApi.save.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        })
    );
    teamsApi.save.mockRejectedValue(new SetupInProgressError());
    const onSaved = vi.fn();
    const { unmount } = render(<TeamPresetPicker onSaved={onSaved} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    // Unmount while try 1 is still in flight, then let it answer "still setting up".
    unmount();
    await act(async () => {
      rejectFirst(new SetupInProgressError());
      await vi.advanceTimersByTimeAsync(3000 * 25);
    });
    expect(teamsApi.save).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a double click on Save while saving saves once', async () => {
    let resolveSave: (list: TeamPickResult[]) => void = () => undefined;
    teamsApi.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        })
    );
    const onSaved = vi.fn();
    render(<TeamPresetPicker onSaved={onSaved} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    const button = saveButton();
    // Two clicks before React re-renders (one batch): the Button's loading state cannot stop the
    // second one yet, only the picker's own guard can.
    act(() => {
      button.click();
      button.click();
    });
    expect(teamsApi.save).toHaveBeenCalledTimes(1);
    // A later click while the save is still running (now in its loading state) adds nothing.
    fireEvent.click(button);
    expect(teamsApi.save).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveSave([{ presetKey: 'support', outcome: 'created', teamId: 2 }]);
      await Promise.resolve();
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('the waiting line and the results are announced (role=status)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    teamsApi.save
      .mockRejectedValueOnce(new SetupInProgressError())
      .mockResolvedValueOnce([{ presetKey: 'support', outcome: 'created', teamId: 2 }]);
    render(<TeamPresetPicker onSaved={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    const waiting = await screen.findByText('Still setting up your workspace…');
    expect(waiting).toHaveAttribute('role', 'status');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const ready = await screen.findByText('Ready');
    expect(ready.closest('[role="status"]')).not.toBeNull();
  });

  it('ITEMS_FAILED without a count: no "(0)"', async () => {
    teamsApi.save.mockResolvedValue([
      { presetKey: 'support', outcome: 'failed', reason: 'ITEMS_FAILED' },
    ]);
    render(<TeamPresetPicker onSaved={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    expect(
      await screen.findByText("Some rules couldn't be added. Save again to retry.")
    ).toBeInTheDocument();
  });

  it('a retry that then succeeds finishes the save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    teamsApi.save
      .mockRejectedValueOnce(new SetupInProgressError())
      .mockResolvedValueOnce([{ presetKey: 'support', outcome: 'created', teamId: 2 }]);
    const onSaved = vi.fn();
    render(<TeamPresetPicker onSaved={onSaved} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    await screen.findByText('Still setting up your workspace…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByText('Still setting up your workspace…')).toBeNull();
  });

  it('the save lock is busy (503): "Couldn\'t save right now. Try again." with Retry', async () => {
    teamsApi.save.mockRejectedValueOnce(lockError());
    const onSaved = vi.fn();
    render(<TeamPresetPicker onSaved={onSaved} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    expect(await screen.findByText("Couldn't save right now. Try again.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('setup finished meanwhile (ONBOARDING_COMPLETE): switches to read-only', async () => {
    teamsApi.save.mockRejectedValueOnce(new OnboardingCompleteError());
    const onNotNeeded = vi.fn();
    render(<TeamPresetPicker onSaved={vi.fn()} onNotNeeded={onNotNeeded} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    expect(
      await screen.findByText('Setup is finished — change teams on the Teams page.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save teams' })).toBeNull();
    expect(locked('Support')).toBe(true);
    expect(onNotNeeded).toHaveBeenCalled();
  });
});

describe('InviteTeamStep with the picker', () => {
  const inviteButton = () => screen.getByRole('button', { name: /Invite someone/ });
  const hint = 'Save your teams first, so you can add people to them.';

  it('the invite list is locked until the teams are saved; then the invite dialog lists the new teams', async () => {
    render(<InviteTeamStep />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(inviteButton()).toBeInactive();
    expect(screen.getByRole('button', { name: /Create a user/ })).toBeInactive();

    getAllDepartments.mockImplementation((_inactive, onMode) => {
      onMode?.(true);
      return Promise.resolve([
        { id: 1, name: 'General', active: true },
        { id: 2, name: 'Support', active: true },
      ]);
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(inviteButton()).not.toBeInactive());
    expect(screen.queryByText(hint)).toBeNull();

    fireEvent.click(inviteButton());
    const dialogTeam = await screen.findByRole('checkbox', { name: /^Support$/ });
    expect(dialogTeam).toBeInTheDocument();
    expect(getAllDepartments).toHaveBeenCalled();
  });

  it('"Skip — just the General team" unlocks the invite list without saving', async () => {
    render(<InviteTeamStep />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(screen.getByRole('button', { name: 'Skip — just the General team' }));
    expect(inviteButton()).not.toBeInactive();
    expect(screen.queryByText(hint)).toBeNull();
    expect(teamsApi.save).not.toHaveBeenCalled();
  });

  it('a failed team still unlocks the invite list (the save happened)', async () => {
    teamsApi.save.mockResolvedValue([
      { presetKey: 'support', outcome: 'failed', reason: 'PLAN_TEAM_LIMIT' },
    ]);
    render(<InviteTeamStep />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    await waitFor(() => expect(inviteButton()).not.toBeInactive());
  });

  it('setup already finished: read-only picker, invite list not locked', async () => {
    teamsApi.get.mockResolvedValue(fresh({ editable: false }));
    render(<InviteTeamStep />);
    await screen.findByText('Setup is finished — change teams on the Teams page.');
    expect(inviteButton()).not.toBeInactive();
    expect(screen.queryByText(hint)).toBeNull();
  });

  it('picker not available (null): the step is as before, nothing locked', async () => {
    teamsApi.get.mockResolvedValue(null);
    render(<InviteTeamStep />);
    await waitFor(() => expect(inviteButton()).not.toBeInactive());
    expect(screen.queryByRole('heading', { name: 'Which teams answer your mail?' })).toBeNull();
    expect(screen.queryByText(hint)).toBeNull();
  });

  it('not a preset workspace (no teamsFromPresets): no picker, no fetch, nothing locked', () => {
    onboarding.current = { status: 'pending' };
    render(<InviteTeamStep />);
    expect(inviteButton()).not.toBeInactive();
    expect(screen.queryByRole('heading', { name: 'Which teams answer your mail?' })).toBeNull();
    expect(screen.queryByText(hint)).toBeNull();
    expect(teamsApi.get).not.toHaveBeenCalled();
  });
});

describe('TeamPresetPicker — the wizard Next guard', () => {
  const mountWithGuard = () => {
    let guard: (() => Promise<boolean>) | null = null;
    const utils = render(
      <TeamPresetPicker
        onSaved={vi.fn()}
        onSkip={vi.fn()}
        registerBeforeNext={(fn) => {
          guard = fn;
        }}
      />
    );
    return { ...utils, next: () => guard!() };
  };

  it('unsaved ticks: saves them, then lets Next go on', async () => {
    const { next } = mountWithGuard();
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(box('Sales'));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await next();
    });
    expect(ok).toBe(true);
    expect(teamsApi.save).toHaveBeenCalledWith(['support', 'sales']);
  });

  it('the save fails: Next is refused and the error shows', async () => {
    teamsApi.save.mockRejectedValue(new Error('boom'));
    const { next } = mountWithGuard();
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await next();
    });
    expect(ok).toBe(false);
    expect(screen.getByText("Couldn't save your teams. Try again.")).toBeInTheDocument();
  });

  it('already saved: Next goes on with no second save', async () => {
    const { next } = mountWithGuard();
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    await waitFor(() => expect(teamsApi.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(saveButton()).not.toBeInactive());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await next();
    });
    expect(ok).toBe(true);
    expect(teamsApi.save).toHaveBeenCalledTimes(1);
  });

  it('teams already made and unchanged: nothing to save', async () => {
    teamsApi.get.mockResolvedValue(
      fresh({ offered: [offer('support', 'Support', { teamId: 2, active: true })] })
    );
    const { next } = mountWithGuard();
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await next();
    });
    expect(ok).toBe(true);
    expect(teamsApi.save).not.toHaveBeenCalled();
  });

  it('skipped: Next does not save the ticks that were skipped', async () => {
    const { next } = mountWithGuard();
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(screen.getByRole('button', { name: 'Skip — just the General team' }));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await next();
    });
    expect(ok).toBe(true);
    expect(teamsApi.save).not.toHaveBeenCalled();
  });

  it('setup still running: Next waits for the retry that succeeds', async () => {
    teamsApi.save
      .mockRejectedValueOnce(new SetupInProgressError())
      .mockResolvedValue([{ presetKey: 'support', outcome: 'created', teamId: 2 }]);
    vi.useFakeTimers();
    const { next } = mountWithGuard();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    let ok: boolean | undefined;
    const pending = next().then((value) => {
      ok = value;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await pending;
    expect(ok).toBe(true);
    expect(teamsApi.save).toHaveBeenCalledTimes(2);
  });

  it('the picker goes away while Next waits for its save: Next is released with false', async () => {
    teamsApi.save.mockReturnValue(new Promise(() => {}));
    const { next, unmount } = mountWithGuard();
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    let ok: boolean | undefined;
    const pending = next().then((value) => {
      ok = value;
    });
    unmount();
    await pending;
    expect(ok).toBe(false);
  });

  it('a team fails in the save Next started: Next stays and shows it; a second Next goes on, no extra save', async () => {
    teamsApi.save.mockResolvedValue([
      { presetKey: 'support', outcome: 'created', teamId: 2 },
      { presetKey: 'sales', outcome: 'failed', reason: 'SEED_FAILED' },
    ]);
    const onSaved = vi.fn();
    let guard: (() => Promise<boolean>) | null = null;
    render(
      <TeamPresetPicker
        onSaved={onSaved}
        registerBeforeNext={(fn) => {
          guard = fn;
        }}
      />
    );
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(box('Sales'));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await guard!();
    });
    expect(ok).toBe(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Couldn't add this team's rules. Save again to retry.")
    ).toBeInTheDocument();
    await act(async () => {
      ok = await guard!();
    });
    expect(ok).toBe(true);
    expect(teamsApi.save).toHaveBeenCalledTimes(1);
  });

  it('teams already made on open: the invite list is unlocked (Back then Next, or a reload)', async () => {
    teamsApi.get.mockResolvedValue(
      fresh({ offered: [offer('support', 'Support', { teamId: 2, active: true })] })
    );
    const onSaved = vi.fn();
    render(<TeamPresetPicker onSaved={onSaved} />);
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('Next pressed while the teams are still loading waits and saves the pre-ticked ones', async () => {
    let release: (value: OnboardingTeams) => void = () => {};
    teamsApi.get.mockReturnValue(new Promise<OnboardingTeams>((resolve) => (release = resolve)));
    const { next } = mountWithGuard();
    let ok: boolean | undefined;
    const pending = next().then((value) => {
      ok = value;
    });
    await act(async () => {
      release(fresh());
      await pending;
    });
    expect(ok).toBe(true);
    expect(teamsApi.save).toHaveBeenCalledWith(['support']);
  });

  it('the picker goes away during the load wait: Next gets false when the load lands', async () => {
    let release: (value: OnboardingTeams) => void = () => {};
    teamsApi.get.mockReturnValue(new Promise<OnboardingTeams>((resolve) => (release = resolve)));
    const { next, unmount } = mountWithGuard();
    let ok: boolean | undefined;
    const pending = next().then((value) => {
      ok = value;
    });
    unmount();
    await act(async () => {
      release(fresh());
      await pending;
    });
    expect(ok).toBe(false);
    expect(teamsApi.save).not.toHaveBeenCalled();
  });

  it('a save refreshes the departments cache', async () => {
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <TeamPresetPicker onSaved={vi.fn()} />
      </QueryClientProvider>
    );
    await screen.findByRole('heading', { name: 'Which teams answer your mail?' });
    fireEvent.click(saveButton());
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['departments'] }));
  });
});
