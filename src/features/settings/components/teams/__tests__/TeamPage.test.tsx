import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesHeldError } from '../../../services/teamBuilder.service';
import type * as BuilderService from '../../../services/teamBuilder.service';

const svc = vi.hoisted(() => ({
  ruleSummary: vi.fn(),
  teamRules: vi.fn(),
  applyItems: vi.fn(),
  applyPreset: vi.fn(),
  saveAsPreset: vi.fn(),
  listPresets: vi.fn(),
  listLibrary: vi.fn(),
  setRole: vi.fn(),
}));
vi.mock('../../../services/teamBuilder.service', async (orig) => ({
  ...(await orig<typeof BuilderService>()),
  teamBuilderService: svc,
}));

const teamsState = vi.hoisted(() => ({
  data: undefined as unknown[] | undefined,
  refetch: vi.fn(),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: teamsState.data,
    isLoading: false,
    refetch: teamsState.refetch,
  }),
}));

let flags: Record<string, boolean> = {};
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    flags,
    loading: false,
    canPreviewUnfinished: true,
    isSurfaceEnabled: (key: string) => flags[key] === true,
    isSurfaceVisibleToMe: () => true,
    isPreviewing: () => false,
  }),
}));

const { TeamPage } = await import('../TeamPage');
const { TeamDetailPage } = await import('@/pages/TeamDetailPage');
const { Route, Routes } = await import('react-router-dom');

const TEAM = { id: 5, name: 'Orders team', color: '#112233', active: true, isDefault: true };
const SUMMARY = [
  { flow: 'routing', total: 2, active: 2, neverFired: 1 },
  { flow: 'prompts', total: 1, active: 1, neverFired: null },
  { flow: 'response', total: 1, active: null, neverFired: null },
];
const ROWS = {
  items: [
    { id: 1, label: 'Order mail', active: true, matchCount: 3, lastMatchedAt: '2026-11-01T10:00:00Z', createdAt: '2026-10-01T10:00:00Z' },
    { id: 2, label: 'Refund mail', active: false, matchCount: 0, lastMatchedAt: null, createdAt: null },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
};
const APPLY = { inserted: 2, alreadyPresent: 0, retired: 0, failed: [], rolesSet: [], previousHolders: [] };
const PRESET = {
  scope: 'platform', id: 3, key: 'support', name: 'Support desk', description: 'Everyday rules',
  roles: [], itemCount: 4, flowCounts: {}, source: 'builtin', retiredCount: 0,
};

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderPage = (teamId = 5, state?: unknown, client: QueryClient = newClient()) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/x', state }]}>
      <QueryClientProvider client={client}>
        <TeamPage teamId={teamId} />
      </QueryClientProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  flags = { 'ui.team_builder': true };
  teamsState.data = [TEAM];
  svc.ruleSummary.mockResolvedValue(SUMMARY);
  svc.teamRules.mockResolvedValue(ROWS);
  svc.listPresets.mockResolvedValue([PRESET]);
  svc.listLibrary.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TeamPage', () => {
  it('shows one tab per flow with totals; the routing tab lists rows with fire counts', async () => {
    renderPage(5, { notice: 'Held roles notice.' });
    expect(await screen.findByText('Routing (2)')).toBeTruthy();
    expect(screen.getByText('Prompts (1)')).toBeTruthy();
    expect(screen.getByText('Response (1)')).toBeTruthy();
    expect(screen.getByText('Held roles notice.')).toBeTruthy();
    expect(screen.getByText('Default')).toBeTruthy();
    expect(await screen.findByText('Order mail')).toBeTruthy();
    expect(screen.getByText(/3 times, last/)).toBeTruthy();
    expect(screen.getByText('Never')).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Edit these rules in Settings' }).getAttribute('href')
    ).toBe('/settings#rules/routing');
  });

  it('a row with no on/off shows a dash and one with no fire record shows Not recorded', async () => {
    svc.teamRules.mockResolvedValue({
      items: [{ id: 7, label: 'Shipping', active: null, matchCount: null, lastMatchedAt: null, createdAt: '2026-10-01T10:00:00Z' }],
      total: 1, page: 1, pageSize: 50,
    });
    renderPage();
    await screen.findByText('Shipping');
    expect(screen.getAllByText('—')).toHaveLength(1);
    expect(screen.getByText('Not recorded')).toBeTruthy();
    expect(screen.queryByText('On')).toBeNull();
  });

  it('Never fired filters through teamRules(..., neverFired: true); the toggle is absent on prompts', async () => {
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('switch', { name: 'Never fired' }));
    await waitFor(() =>
      expect(svc.teamRules).toHaveBeenCalledWith(5, expect.objectContaining({ flow: 'routing', neverFired: true }))
    );
    fireEvent.click(screen.getByText('Prompts (1)'));
    await waitFor(() => expect(svc.teamRules).toHaveBeenCalledWith(5, expect.objectContaining({ flow: 'prompts' })));
    expect(screen.queryByRole('switch', { name: 'Never fired' })).toBeNull();
    fireEvent.click(screen.getByText('Response (1)'));
    expect(await screen.findByText('These rules are managed by the system.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Edit these rules in Settings' })).toBeNull();
  });

  it('Add from library: picking two items sends applyItems once and shows the result', async () => {
    svc.listLibrary.mockResolvedValue({
      items: [
        { id: 11, flow: 'spam', name: 'Lottery', description: '', purposeGroup: null, preview: null },
        { id: 12, flow: 'spam', name: 'Prize', description: '', purposeGroup: null, preview: null },
      ],
      total: 2, page: 1, pageSize: 50, countsByFlow: { spam: 2 },
    });
    let finish: (value: unknown) => void = () => {};
    svc.applyItems.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Add rules from the library' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Pick Lottery' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Pick Prize' }));
    const add = screen.getByRole('button', { name: 'Add 2 rules' });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(svc.applyItems).toHaveBeenCalledTimes(1);
    expect(svc.applyItems).toHaveBeenCalledWith(5, [11, 12]);
    finish(APPLY);
    expect(await screen.findByText('2 rules added')).toBeTruthy();
    await waitFor(() => expect(svc.ruleSummary).toHaveBeenCalledTimes(2));
  });

  it('Apply a preset with a held role asks first; Move sends moveRoles true', async () => {
    svc.applyPreset
      .mockRejectedValueOnce(new RolesHeldError([{ role: 'generalRules', teamId: 9, teamName: 'Sales team' }]))
      .mockRejectedValueOnce(new RolesHeldError([{ role: 'generalRules', teamId: 9, teamName: 'Sales team' }]))
      .mockResolvedValueOnce(APPLY);
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Apply a preset' }));
    fireEvent.click(await screen.findByText('Support desk'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const list = await screen.findByTestId('roles-held-list');
    expect(within(list).getByText(/Sales team/)).toBeTruthy();
    expect(svc.applyPreset).toHaveBeenCalledWith(5, { scope: 'platform', id: 3 }, undefined);
    fireEvent.click(screen.getByRole('button', { name: /^Keep/ }));
    await waitFor(() => expect(screen.queryByTestId('roles-held-list')).toBeNull());
    expect(svc.applyPreset).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply a preset' }));
    fireEvent.click(await screen.findByText('Support desk'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByTestId('roles-held-list');
    fireEvent.click(screen.getByRole('button', { name: /^Move/ }));
    await waitFor(() =>
      expect(svc.applyPreset).toHaveBeenLastCalledWith(5, { scope: 'platform', id: 3 }, true)
    );
    expect(await screen.findByText('2 rules added')).toBeTruthy();
  });

  it('Save as preset shows the skipped list', async () => {
    svc.saveAsPreset.mockResolvedValue({
      preset: PRESET,
      skipped: [{ flow: 'categories', name: 'Shipping', reason: 'applies to the whole workspace' }],
    });
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Save as preset' }));
    fireEvent.change(await screen.findByLabelText('Preset name'), { target: { value: 'My preset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(await screen.findByText('Shipping (Categories): applies to the whole workspace')).toBeTruthy();
    expect(svc.saveAsPreset).toHaveBeenCalledWith(5, { name: 'My preset', description: '' });
  });

  it('a failed action shows its error inside the open dialog', async () => {
    svc.applyItems.mockRejectedValue(new Error('boom'));
    svc.listLibrary.mockResolvedValue({
      items: [{ id: 11, flow: 'spam', name: 'Lottery', description: '', purposeGroup: null, preview: null }],
      total: 1, page: 1, pageSize: 50, countsByFlow: { spam: 1 },
    });
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Add rules from the library' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Pick Lottery' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 rule' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
  });

  it('the Apply a preset dialog shows each preset roles as badges', async () => {
    svc.listPresets.mockResolvedValue([{ ...PRESET, roles: ['generalRules'] }]);
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Apply a preset' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('General rules')).toBeTruthy();
  });

  it('save as preset marks the preset lists stale so they refetch', async () => {
    svc.saveAsPreset.mockResolvedValue({ preset: PRESET, skipped: [] });
    const client = newClient();
    client.setQueryData(['team-presets'], [PRESET]);
    renderPage(5, undefined, client);
    await screen.findByText('Order mail');
    expect(client.getQueryState(['team-presets'])?.isInvalidated).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save as preset' }));
    fireEvent.change(await screen.findByLabelText('Preset name'), { target: { value: 'My preset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    await screen.findByText('Saved the preset Support desk.');
    expect(client.getQueryState(['team-presets'])?.isInvalidated).toBe(true);
  });

  it('changing a role refetches the teams and marks every department list stale', async () => {
    svc.setRole.mockResolvedValue(undefined);
    const client = newClient();
    client.setQueryData(['departments'], []);
    renderPage(5, undefined, client);
    await screen.findByText('Order mail');
    // CONTROL: nothing refreshed before the change.
    expect(teamsState.refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Billing details'));
    await waitFor(() => expect(svc.setRole).toHaveBeenCalledWith(5, 'billingExtraction', true));
    await waitFor(() => expect(teamsState.refetch).toHaveBeenCalledTimes(1));
    expect(client.getQueryState(['departments'])?.isInvalidated).toBe(true);
  });

  it('a rules tab says it is loading, not that it has no rules, before the first answer', async () => {
    svc.teamRules.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(await screen.findByText('Loading rules…')).toBeTruthy();
    expect(screen.queryByText('No rules in this flow.')).toBeNull();
  });

  it('the Apply a preset dialog says when the presets failed to load, and "1 rule" for one item', async () => {
    svc.listPresets.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Apply a preset' }));
    expect(await screen.findByText('The presets could not be loaded.')).toBeTruthy();
    cleanup();
    svc.listPresets.mockResolvedValue([{ ...PRESET, itemCount: 1 }]);
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Apply a preset' }));
    expect(await screen.findByText('1 rule')).toBeTruthy();
  });

  it('applying rules refreshes every department list', async () => {
    svc.applyPreset.mockResolvedValue(APPLY);
    const client = newClient();
    client.setQueryData(['departments'], []);
    renderPage(5, undefined, client);
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Apply a preset' }));
    fireEvent.click(await screen.findByText('Support desk'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByText('2 rules added');
    expect(client.getQueryState(['departments'])?.isInvalidated).toBe(true);
  });

  it('a failed Apply shows its error inside the Apply a preset dialog, and closing clears it', async () => {
    svc.applyPreset.mockRejectedValue(new Error('boom'));
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Apply a preset' }));
    fireEvent.click(await screen.findByText('Support desk'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a failed Save shows its error inside the Save as preset dialog', async () => {
    svc.saveAsPreset.mockRejectedValue(new Error('boom'));
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Save as preset' }));
    fireEvent.change(await screen.findByLabelText('Preset name'), { target: { value: 'My preset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
  });

  it('a failed Move it here shows the error inside the roles-held dialog and keeps it open', async () => {
    svc.applyPreset
      .mockRejectedValueOnce(new RolesHeldError([{ role: 'generalRules', teamId: 9, teamName: 'Sales team' }]))
      .mockRejectedValueOnce(new Error('boom'));
    renderPage();
    await screen.findByText('Order mail');
    fireEvent.click(screen.getByRole('button', { name: 'Apply a preset' }));
    fireEvent.click(await screen.findByText('Support desk'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByTestId('roles-held-list');
    fireEvent.click(screen.getByRole('button', { name: /^Move/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
    expect(within(dialog).getByTestId('roles-held-list')).toBeTruthy();
  });

  it('the rule summary error shows an alert and Retry refetches', async () => {
    svc.ruleSummary.mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(await screen.findByText("Could not load this team's rules.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Routing (2)')).toBeTruthy();
    expect(svc.ruleSummary).toHaveBeenCalledTimes(2);
  });

  it('an unknown team sends no summary request', async () => {
    renderPage(99);
    await screen.findByText('This team does not exist or is switched off.');
    expect(svc.ruleSummary).not.toHaveBeenCalled();
  });

  it('a non-numeric id shows the not-found alert', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/teams/abc']}>
        <QueryClientProvider client={new QueryClient()}>
          <Routes>
            <Route path="/settings/teams/:teamId" element={<TeamDetailPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('This team does not exist or is switched off.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Teams' })).toBeTruthy();
  });

  it('an unknown team shows the not-found line', async () => {
    renderPage(99);
    expect(await screen.findByText('This team does not exist or is switched off.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Teams' }).getAttribute('href')).toBe('/settings#teams');
    teamsState.data = [{ ...TEAM, active: false }];
    cleanup();
    renderPage(5);
    expect(await screen.findByText('This team does not exist or is switched off.')).toBeTruthy();
  });

  it('flag off: unavailable for a global admin', () => {
    flags = {};
    render(
      <MemoryRouter initialEntries={['/settings/teams/5']}>
        <QueryClientProvider client={new QueryClient()}>
          <Routes>
            <Route path="/settings/teams/:teamId" element={<TeamDetailPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('team-page')).toBeNull();
    expect(svc.ruleSummary).not.toHaveBeenCalled();
  });
});
