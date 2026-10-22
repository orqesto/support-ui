/**
 * The switch-off dialog fed by the REAL service from raw backend payloads (be-report.md API
 * section), so wire drift between the BE shape and what the dialog shows fails here — the
 * TeamsSettings tests mock the normalised preview and cannot catch it.
 *
 * Also #6: after ANY refusal or server error of PUT /mode the dialog re-reads GET /mode, and an
 * interrupted switch-off is handed to the screen at once (no reload needed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {}, info: () => {} } }));

const { TeamsOffDialog } = await import('../TeamsOffDialog');

const zeroMoves = {
  conversations: 0,
  openConversations: 0,
  tickets: 0,
  channels: 0,
  members: 0,
  messageSources: 0,
  channelLinks: 0,
  kbEntries: 0,
  kbSourceLinks: 0,
  documents: 0,
  replyTemplates: 0,
  customApiConnections: 0,
  chatWidgets: 0,
  chatWidgetLinks: 0,
  ticketingIntegrations: 0,
  spamRules: 0,
  detectionRules: 0,
  contradictionRules: 0,
  responseRules: 0,
  categories: 0,
  labels: 0,
  labelLinks: 0,
  spamLogEntries: 0,
};
const sameAsDefault = {
  ticketingIntegrations: 0,
  spamRules: 1,
  detectionRules: 0,
  contradictionRules: 0,
  responseRules: 0,
};

/** A raw GET /api/departments/mode/preview body, as the backend sends it. */
const rawPreview = (blockers: unknown[] = []) => ({
  success: true,
  data: {
    enabled: true,
    defaultDepartment: { id: 1, name: 'General team' },
    teams: [
      {
        id: 2,
        name: 'Support team',
        slug: 'support',
        moves: {
          ...zeroMoves,
          conversations: 40,
          tickets: 3,
          replyTemplates: 2,
          mergedIntoSameName: { labels: 1, categories: 0 },
        },
        staysWithTeam: { routingRules: 4, promptTemplates: 1, sameAsDefault },
      },
    ],
    inactiveTeams: [
      {
        id: 7,
        name: 'Old team',
        slug: 'old',
        moves: { ...zeroMoves, conversations: 5, mergedIntoSameName: { labels: 0, categories: 1 } },
        staysWithTeam: {
          routingRules: 0,
          promptTemplates: 0,
          sameAsDefault: { ...sameAsDefault, spamRules: 0 },
        },
      },
    ],
    totals: {
      ...zeroMoves,
      conversations: 45,
      tickets: 3,
      replyTemplates: 2,
      mergedIntoSameName: { labels: 1, categories: 1 },
    },
    membersAddedToDefault: 2,
    leadQualificationMovesToDefault: true,
    blockers,
    irreversible: true,
  },
});

const renderDialog = () => {
  const onDone = vi.fn(() => Promise.resolve());
  const onInterrupted = vi.fn();
  render(<TeamsOffDialog open onClose={vi.fn()} onDone={onDone} onInterrupted={onInterrupted} />);
  return { onDone, onInterrupted };
};

const routeGet = (preview: unknown, mode: unknown) =>
  api.get.mockImplementation((url: string) =>
    Promise.resolve({ data: url.endsWith('/preview') ? preview : mode })
  );

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
});
afterEach(cleanup);

describe('TeamsOffDialog — raw backend preview through the service', () => {
  it('shows the totals (non-zero rows, readable labels), stays, merges, members and lead line', async () => {
    routeGet(rawPreview(), {
      success: true,
      data: { enabled: true, switching: false, interrupted: false },
    });
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/1 team will be merged into General team/)).toBeTruthy();
    const moves = within(dialog).getByRole('list', { name: 'What moves' });
    expect(
      within(moves)
        .getAllByRole('listitem')
        .map((row) => row.textContent)
    ).toEqual(['Threads45', 'Tickets3', 'Reply templates2']);
    expect(
      within(dialog).getByText(/What 1 team already switched off still hold moves/)
    ).toBeTruthy();
    const stays = within(dialog).getByRole('list', { name: 'What stays with each team' });
    expect(
      within(stays)
        .getAllByRole('listitem')
        .map((row) => row.textContent)
    ).toEqual([
      'Routing rules4',
      'AI prompt templates1',
      'Spam rules the default team already has1',
    ]);
    expect(within(dialog).getByText(/1 label and 1 category with the same name/)).toBeTruthy();
    expect(within(dialog).getByText(/2 people are added to General team/)).toBeTruthy();
    expect(within(dialog).getByText(/Lead qualification will run on General team/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Switch teams off' })).not.toBeDisabled();
  });

  it('lists Threads, Open threads, Tickets first, and the warning keeps "AI" upper case', async () => {
    const raw = rawPreview();
    raw.data.totals = { ...raw.data.totals, categories: 6, openConversations: 9 };
    routeGet(raw, { success: true, data: { enabled: true, switching: false, interrupted: false } });
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    const moves = await within(dialog).findByRole('list', { name: 'What moves' });
    expect(
      within(moves)
        .getAllByRole('listitem')
        .map((row) => row.textContent)
    ).toEqual(['Threads45', 'Open threads9', 'Tickets3', 'Reply templates2', 'Categories6']);
    expect(
      within(dialog).getByText(/comes back with its routing rules, AI prompt templates/)
    ).toBeTruthy();
  });

  it('a raw blocker (with integrationId) is listed in the backend wording and disables the confirm', async () => {
    routeGet(
      rawPreview([
        {
          kind: 'ticketingIntegration',
          teamId: 2,
          teamName: 'Support team',
          integrationId: 41,
          integrationName: 'Support Jira',
        },
      ]),
      { success: true, data: { enabled: true, switching: false, interrupted: false } }
    );
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    const line = await within(dialog).findByText(
      /Team Support team has its own ticket system connection Support Jira/
    );
    expect(line.textContent).toContain(
      "Remove or disable it, or replace General team's own with it"
    );
    expect(line.textContent).toContain(
      "Its tickets will then sync through General team's connection."
    );
    expect(within(dialog).getByRole('button', { name: 'Switch teams off' })).toBeDisabled();
  });
});

describe('TeamsOffDialog — #6 an error that left the switch-off interrupted', () => {
  const confirmWith = async (error: unknown, mode: unknown) => {
    routeGet(rawPreview(), mode);
    api.put.mockRejectedValue(error);
    const handlers = renderDialog();
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/1 team will be merged/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch teams off' }));
    return { ...handlers, dialog };
  };

  it('a 500 whose switch stopped part-way: GET /mode is re-read and the screen is told at once', async () => {
    const { onInterrupted } = await confirmWith(
      Object.assign(new Error('Server error'), {
        status: 500,
        data: { success: false, error: 'Internal error' },
      }),
      { success: true, data: { enabled: true, switching: true, interrupted: true } }
    );
    await waitFor(() => expect(onInterrupted).toHaveBeenCalledTimes(1));
    expect(api.get).toHaveBeenCalledWith('/api/departments/mode');
  });

  it('409 TEAMS_SWITCH_INTERRUPTED is handed to the screen the same way', async () => {
    const { onInterrupted } = await confirmWith(
      Object.assign(new Error('x'), {
        status: 409,
        data: {
          success: false,
          error: 'Switching teams off did not finish.',
          code: 'TEAMS_SWITCH_INTERRUPTED',
        },
      }),
      { success: true, data: { enabled: true, switching: true, interrupted: true } }
    );
    await waitFor(() => expect(onInterrupted).toHaveBeenCalledTimes(1));
  });

  it('CONTROL: a refusal that left nothing interrupted shows its message and tells the screen nothing', async () => {
    const { onInterrupted, dialog } = await confirmWith(
      Object.assign(new Error('x'), {
        status: 409,
        data: {
          success: false,
          error: 'This workspace has no active team to keep. Switch a team on first.',
        },
      }),
      { success: true, data: { enabled: true, switching: false, interrupted: false } }
    );
    expect(
      await within(dialog).findByText(
        'This workspace has no active team to keep. Switch a team on first.'
      )
    ).toBeTruthy();
    expect(onInterrupted).not.toHaveBeenCalled();
  });
});
