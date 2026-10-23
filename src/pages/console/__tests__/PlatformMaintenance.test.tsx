/**
 * Console → Maintenance (owner decisions 2026-10-20). Renders the real page and service over a
 * mocked transport, so the request each control sends is what is asserted:
 * - a job's switch PATCHes that job;
 * - a repair's Check sends NO apply and names the picked workspace on the request itself (the
 *   platform console sends no workspace by default);
 * - Apply needs a Check first and a confirm, and only then sends `apply: true`;
 * - an all-workspaces repair applies to exactly the workspaces its check found;
 * - "Repairs allowed" off disables every Check and Apply.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chooseOption } from '@/test/chooseOption';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/hooks/usePlatformAdmin', () => ({
  usePlatformSyncCheckpoints: () => ({ isLoading: false, data: [{ id: 1 }, { id: 2 }] }),
  useClearSyncCheckpoints: () => ({ mutateAsync: vi.fn() }),
  usePlatformWorkspaces: () => ({
    isLoading: false,
    data: {
      data: [
        { id: 12, name: 'Example Workspace' },
        { id: 13, name: 'Second Workspace' },
      ],
    },
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PlatformMaintenance, describeSchedule } from '../PlatformMaintenance';
import { REPAIRS } from '@/components/console/maintenance/repairCatalog';

const REPAIR_APPLY_BUTTONS = REPAIRS.filter((repair) => !repair.checkOnly).length;

const state = (allowed = true) => ({
  data: {
    data: {
      jobs: [
        {
          id: 'lostJobSweep',
          label: 'Lost-job sweep',
          does: 'Re-queues inbound mail saved without its job.',
          whenOff: 'Mail that lost its job is not picked up again.',
          schedule: { kind: 'interval', minutes: 15 },
          enabled: true,
          lastRun: { at: '2026-10-20T10:00:00.000Z', outcome: 'ok', durationMs: 40 },
          nextRunAt: '2026-10-20T10:15:00.000Z',
        },
        {
          id: 'cleanupSchedule',
          label: 'Nightly cleanup',
          does: 'Removes old files.',
          whenOff: 'Old files are kept.',
          schedule: { kind: 'daily', hour: 2 },
          enabled: false,
          lastRun: { at: '2026-10-20T02:00:00.000Z', outcome: 'skipped' },
          nextRunAt: null,
        },
      ],
      repairs: { allowed, source: 'console' },
    },
  },
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlatformMaintenance />
    </QueryClientProvider>
  );

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
  api.get.mockImplementation((url: string) =>
    url === '/api/system/maintenance'
      ? Promise.resolve(state())
      : Promise.resolve({ data: { data: {} } })
  );
  api.patch.mockResolvedValue({ data: { success: true } });
});
afterEach(cleanup);

describe('PlatformMaintenance — background jobs', () => {
  it('lists each job with its schedule, last run and state', async () => {
    renderPage();
    const sweep = await screen.findByTestId('job-lostJobSweep');
    expect(within(sweep).getByText('Every 15 min')).toBeTruthy();
    expect(within(sweep).getByText('OK')).toBeTruthy();
    const cleanupRow = screen.getByTestId('job-cleanupSchedule');
    expect(within(cleanupRow).getByText('Skipped (off)')).toBeTruthy();
    expect(within(cleanupRow).getByText('Off: Old files are kept.')).toBeTruthy();
  });

  it('the switch PATCHes that job', async () => {
    renderPage();
    const sweep = await screen.findByTestId('job-lostJobSweep');
    fireEvent.click(within(sweep).getByRole('switch'));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/system/maintenance/jobs/lostJobSweep', {
        enabled: false,
      })
    );
  });

  const withProgress = (progress: unknown) => {
    const base = state();
    const threeMinutesAgo = new Date(Date.now() - 3 * 60_000).toISOString();
    const backlogJob = {
      id: 'backlogSweep',
      label: 'Backlog sweep',
      does: 'Works through a backlog.',
      whenOff: 'The backlog waits.',
      schedule: { kind: 'interval', minutes: 1 },
      enabled: true,
      lastRun: {
        at: threeMinutesAgo,
        outcome: 'ok',
        durationMs: 10,
        ...(progress ? { progress } : {}),
      },
      nextRunAt: null,
    };
    const response = {
      data: { data: { ...base.data.data, jobs: [...base.data.data.jobs, backlogJob] } },
    };
    api.get.mockImplementation((url: string) =>
      url === '/api/system/maintenance'
        ? Promise.resolve(response)
        : Promise.resolve({ data: { data: {} } })
    );
  };

  it("shows a backlog job's rows and workspaces left, with when it was updated", async () => {
    withProgress({ done: false, workspacesLeft: 2, rowsLeft: 1234, stamped: 500 });
    renderPage();
    const row = await screen.findByTestId('job-backlogSweep');
    expect(within(row).getByTestId('job-progress-backlogSweep').textContent).toBe(
      `${(1234).toLocaleString()} rows left in 2 workspaces · updated 3m ago`
    );
  });

  it('shows Done once the backlog is finished', async () => {
    withProgress({ done: true, workspacesLeft: 0, rowsLeft: 0, stamped: 0 });
    renderPage();
    const row = await screen.findByTestId('job-backlogSweep');
    expect(within(row).getByTestId('job-progress-backlogSweep').textContent).toBe(
      'Done · updated 3m ago'
    );
  });

  it('shows In progress when rows left is unknown (null), with the workspaces left', async () => {
    withProgress({ done: false, workspacesLeft: 3, rowsLeft: null, stamped: 200 });
    renderPage();
    const row = await screen.findByTestId('job-backlogSweep');
    expect(within(row).getByTestId('job-progress-backlogSweep').textContent).toBe(
      'In progress · 3 workspaces left · updated 3m ago'
    );
  });

  it('shows plain In progress when neither count is known', async () => {
    withProgress({ done: false });
    renderPage();
    const row = await screen.findByTestId('job-backlogSweep');
    expect(within(row).getByTestId('job-progress-backlogSweep').textContent).toBe(
      'In progress · updated 3m ago'
    );
  });

  it('shows no progress line when the last run carries none (older backends)', async () => {
    withProgress(undefined);
    renderPage();
    const row = await screen.findByTestId('job-backlogSweep');
    expect(within(row).queryByTestId('job-progress-backlogSweep')).toBeNull();
    expect(within(row).queryByText(/rows? left|Done/)).toBeNull();
  });

  it('describes schedules in words', () => {
    expect(describeSchedule({ kind: 'daily', hour: 0, minute: 15 })).toBe(
      'Daily at 00:15 (server time)'
    );
    expect(describeSchedule({ kind: 'daily', hour: 8, note: 'Mondays' })).toBe(
      'Mondays at 08:00 (server time)'
    );
    expect(describeSchedule({ kind: 'interval', minutes: 360 })).toBe('Every 6 h');
    expect(describeSchedule({ kind: 'startup' })).toBe('When the server starts');
  });
});

describe('PlatformMaintenance — repairs', () => {
  it('Check waits for a workspace, then sends no apply and names the workspace', async () => {
    api.post.mockResolvedValue({
      data: { data: { candidates: 3, reopened: 0, truncated: false } },
    });
    renderPage();
    const row = await screen.findByTestId('repair-repair-swept-reopens');
    const check = within(row).getByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();

    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Example Workspace'
    );
    const rowAfter = screen.getByTestId('repair-repair-swept-reopens');
    fireEvent.click(within(rowAfter).getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/system/repair-swept-reopens',
        {},
        { organizationContext: 12 }
      )
    );
    expect(await within(rowAfter).findByText('candidates')).toBeTruthy();
  });

  it('Apply is disabled until a Check, then confirms before sending apply: true', async () => {
    api.post.mockResolvedValue({ data: { data: { candidates: 3 } } });
    renderPage();
    await screen.findByTestId('repair-repair-swept-reopens');
    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Example Workspace'
    );
    const row = screen.getByTestId('repair-repair-swept-reopens');
    const apply = within(row).getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);
    expect(api.post).toHaveBeenCalledTimes(1); // nothing written before the confirm
    // The confirm dialog's own Apply is the last one on the page.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Apply' }).length).toBeGreaterThan(
        REPAIR_APPLY_BUTTONS
      )
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' }).at(-1) as HTMLElement);
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith(
        '/api/system/repair-swept-reopens',
        { apply: true },
        { organizationContext: 12 }
      )
    );
  });

  it('an all-workspaces repair applies to exactly the workspaces its check found', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        data: {
          workspaces: [{ organizationId: 4 }, { organizationId: 9 }],
          organizationIds: [4, 9],
        },
      },
    });
    api.post.mockResolvedValue({ data: { data: { updated: [] } } });
    renderPage();
    const row = await screen.findByTestId('repair-deleted-at-backfill');
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/system/deleted-at-backfill', {}, {})
    );
    const apply = within(row).getByRole('button', { name: 'Apply' });
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' }).at(-1) as HTMLElement);
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith(
        '/api/system/deleted-at-backfill',
        { apply: true, organizationIds: [4, 9] },
        {}
      )
    );
  });

  it('repairs switched off: every Check and Apply is disabled, and the switch PATCHes', async () => {
    api.get.mockImplementation((url: string) =>
      url === '/api/system/maintenance'
        ? Promise.resolve(state(false))
        : Promise.resolve({ data: { data: {} } })
    );
    renderPage();
    await screen.findByText(/Repairs are switched off on this deployment/);
    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Example Workspace'
    );
    for (const button of screen
      .getAllByRole('button', { name: /^(Check|Apply)$/ })
      .filter((button) => !button.closest('[data-testid="repair-relayed-fusion-report"]'))) {
      expect(button).toBeDisabled();
    }
    const repairsSwitch = screen.getByText('Repairs switched off').closest('label') as HTMLElement;
    fireEvent.click(within(repairsSwitch).getByRole('switch'));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/system/maintenance/repairs', { allowed: true })
    );
  });

  it('CONTROL: repairs allowed, a Check is clickable once a workspace is picked', async () => {
    renderPage();
    await screen.findByTestId('repair-repair-swept-reopens');
    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Example Workspace'
    );
    const check = within(screen.getByTestId('repair-repair-swept-reopens')).getByRole('button', {
      name: 'Check',
    });
    expect(check).not.toBeDisabled();
  });

  it('each job switch is named by its job, not by its state', async () => {
    renderPage();
    await screen.findByTestId('job-lostJobSweep');
    expect(screen.getByRole('switch', { name: 'Lost-job sweep' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Nightly cleanup' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Repairs allowed' })).toBeTruthy();
  });

  it('an Apply spends its Check: Apply is disabled again until the next Check', async () => {
    api.post.mockResolvedValue({ data: { data: { candidates: 3 } } });
    renderPage();
    await screen.findByTestId('repair-repair-swept-reopens');
    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Example Workspace'
    );
    const row = screen.getByTestId('repair-repair-swept-reopens');
    const apply = within(row).getByRole('button', { name: 'Apply' });
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' }).at(-1) as HTMLElement);
    await within(row).findByText('Applied');
    expect(apply).toBeDisabled();
  });

  it('switching workspace clears every result read in the previous one', async () => {
    api.post.mockResolvedValue({ data: { data: { candidates: 3 } } });
    renderPage();
    await screen.findByTestId('repair-repair-swept-reopens');
    const picker = document.getElementById('maintenance-workspace') as HTMLElement;
    await chooseOption(picker, 'Example Workspace');
    const row = screen.getByTestId('repair-repair-swept-reopens');
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    await within(row).findByText('Check (nothing changed)');
    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Second Workspace'
    );
    const fresh = screen.getByTestId('repair-repair-swept-reopens');
    expect(within(fresh).queryByText('Check (nothing changed)')).toBeNull();
    expect(within(fresh).getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('an all-workspaces Check adds up the counts of the workspaces it found', async () => {
    api.post.mockResolvedValue({
      data: {
        data: {
          workspaces: [
            { organizationId: 4, candidates: 5, samples: [] },
            { organizationId: 9, candidates: 7, samples: [] },
          ],
          organizationIds: [4, 9],
        },
      },
    });
    renderPage();
    const row = await screen.findByTestId('repair-deleted-at-backfill');
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    expect(await within(row).findByText('2 item(s) · candidates 12')).toBeTruthy();
  });

  it('the read-only report stays available while repairs are switched off', async () => {
    api.get.mockImplementation((url: string) =>
      url === '/api/system/maintenance'
        ? Promise.resolve(state(false))
        : Promise.resolve({ data: { data: { fusedConversations: 0 } } })
    );
    renderPage();
    await screen.findByText(/Repairs are switched off on this deployment/);
    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Example Workspace'
    );
    const row = screen.getByTestId('repair-relayed-fusion-report');
    const check = within(row).getByRole('button', { name: 'Check' });
    expect(check).not.toBeDisabled();
  });
});

describe('PlatformMaintenance — lost attachments repair', () => {
  const ID = 'repair-repair-lost-attachments';
  const pick = async () => {
    renderPage();
    await screen.findByTestId(ID);
    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Example Workspace'
    );
    return screen.getByTestId(ID);
  };

  it('is listed by name and POSTs repair-lost-attachments as a dry run first', async () => {
    api.post.mockResolvedValue({
      data: {
        data: {
          scanned: 100,
          eventsWithLoss: 2,
          partsLost: 5,
          byMailbox: [{ messageSourceId: 4, name: 'Support Gmail', partsLost: 5 }],
          unrecoverable: { events: 1, parts: 2 },
          nextAfterEventId: null,
          truncated: false,
          applied: false,
        },
      },
    });
    const row = await pick();
    expect(within(row).getByText('Find attachments lost to Gmail quota')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/system/repair-lost-attachments',
        {},
        { organizationContext: 12 }
      )
    );
    expect(await within(row).findByText(/Support Gmail: 5 attachments lost/)).toBeTruthy();
    expect(within(row).getByText('Checked 100 messages.')).toBeTruthy();
    expect(
      within(row).getByText('5 attachments in 2 messages were lost and can be fetched again.')
    ).toBeTruthy();
    expect(within(row).getAllByText(/Support Gmail/)).toHaveLength(1);
    expect(
      within(row).getByText(/2 attachments in 1 message can’t be fetched again because/)
    ).toBeTruthy();
    for (const raw of ['eventsWithLoss', 'partsLost', 'nextAfterEventId', 'truncated'])
      expect(within(row).queryByText(raw)).toBeNull();
  });

  it('applied wording, and unrecoverable is hidden at 0', async () => {
    api.post.mockResolvedValue({
      data: {
        data: {
          scanned: 10,
          eventsWithLoss: 1,
          partsLost: 3,
          byMailbox: [],
          unrecoverable: { events: 0, parts: 0 },
          nextAfterEventId: null,
          truncated: false,
          applied: true,
        },
      },
    });
    const row = await pick();
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    await within(row).findByText(/Checked 10 messages/);
    fireEvent.click(within(row).getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Apply' }).length).toBeGreaterThan(
        REPAIR_APPLY_BUTTONS
      )
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' }).at(-1) as HTMLElement);
    expect(
      await within(row).findByText(/3 attachments in 1 message were lost and were queued/)
    ).toBeTruthy();
    expect(within(row).queryByText(/can’t be fetched again/)).toBeNull();
  });

  it('singular wording, and nothing lost reads as such', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        data: {
          scanned: 1,
          eventsWithLoss: 1,
          partsLost: 1,
          byMailbox: [{ messageSourceId: 4, name: 'Box', partsLost: 1 }],
          unrecoverable: { events: 1, parts: 1 },
          nextAfterEventId: null,
          truncated: false,
          applied: false,
        },
      },
    });
    const row = await pick();
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    expect(await within(row).findByText('Checked 1 message.')).toBeTruthy();
    expect(
      within(row).getByText('1 attachment in 1 message was lost and can be fetched again.')
    ).toBeTruthy();
    expect(within(row).getByText('Box: 1 attachment lost')).toBeTruthy();
    api.post.mockResolvedValueOnce({
      data: {
        data: { scanned: 4, eventsWithLoss: 0, partsLost: 0, byMailbox: [], truncated: false },
      },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    expect(await within(row).findByText('No lost attachments found.')).toBeTruthy();
    expect(within(row).queryByText(/were lost/)).toBeNull();
  });

  it('nothing lost, applied: reads as nothing found; one queued attachment agrees in number', async () => {
    const result = (partsLost: number) => ({
      data: {
        data: {
          scanned: 4,
          eventsWithLoss: partsLost,
          partsLost,
          byMailbox: [],
          truncated: false,
          applied: true,
        },
      },
    });
    api.post.mockResolvedValueOnce(result(0)).mockResolvedValueOnce(result(0));
    const row = await pick();
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    await within(row).findByText(/Checked 4 messages/);
    fireEvent.click(within(row).getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Apply' }).length).toBeGreaterThan(
        REPAIR_APPLY_BUTTONS
      )
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' }).at(-1) as HTMLElement);
    expect(await within(row).findByText('No lost attachments found.')).toBeTruthy();
  });

  it('one applied attachment: "was lost and was queued"', async () => {
    api.post.mockResolvedValue({
      data: {
        data: { scanned: 4, eventsWithLoss: 1, partsLost: 1, byMailbox: [], applied: true },
      },
    });
    const row = await pick();
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    expect(
      await within(row).findByText(
        /1 attachment in 1 message was lost and was queued; each mailbox check fetches it/
      )
    ).toBeTruthy();
  });

  it('Apply right after the first batch sends no afterEventId', async () => {
    api.post.mockResolvedValue({
      data: {
        data: {
          scanned: 1,
          eventsWithLoss: 0,
          partsLost: 0,
          byMailbox: [],
          unrecoverable: { events: 0, parts: 0 },
          nextAfterEventId: 500,
          truncated: true,
          applied: false,
        },
      },
    });
    const row = await pick();
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    await within(row).findByText(/More messages remain/);
    fireEvent.click(within(row).getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Apply' }).length).toBeGreaterThan(
        REPAIR_APPLY_BUTTONS
      )
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' }).at(-1) as HTMLElement);
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith(
        '/api/system/repair-lost-attachments',
        { apply: true },
        { organizationContext: 12 }
      )
    );
  });

  it('a truncated check continues from nextAfterEventId; Apply writes the batch that was checked', async () => {
    const page = (next: number | null) => ({
      data: {
        data: {
          scanned: 10,
          eventsWithLoss: 1,
          partsLost: 1,
          byMailbox: [],
          unrecoverable: { events: 0, parts: 0 },
          nextAfterEventId: next,
          truncated: next !== null,
          applied: false,
        },
      },
    });
    api.post.mockResolvedValueOnce(page(500)).mockResolvedValueOnce(page(null));
    const row = await pick();
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    expect(await within(row).findByText(/More messages remain/)).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Check next batch' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith(
        '/api/system/repair-lost-attachments',
        { afterEventId: 500 },
        { organizationContext: 12 }
      )
    );
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Check' })).toBeTruthy());
    api.post.mockResolvedValueOnce(page(null));
    fireEvent.click(within(row).getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Apply' }).length).toBeGreaterThan(
        REPAIR_APPLY_BUTTONS
      )
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' }).at(-1) as HTMLElement);
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith(
        '/api/system/repair-lost-attachments',
        { apply: true, afterEventId: 500 },
        { organizationContext: 12 }
      )
    );
  });
});

describe('PlatformMaintenance — tools moved from Console → System', () => {
  it('shows the sync checkpoints and the global-admin memberships cards', async () => {
    renderPage();
    expect(await screen.findByText('Sync checkpoints')).toBeTruthy();
    expect(screen.getByText(/2 checkpoints stored/)).toBeTruthy();
    expect(screen.getByText('Global-admin memberships')).toBeTruthy();
  });
});
