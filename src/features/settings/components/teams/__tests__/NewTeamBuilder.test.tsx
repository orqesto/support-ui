import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesHeldError, TeamNotReturnedError } from '../../../services/teamBuilder.service';
import type * as BuilderService from '../../../services/teamBuilder.service';

const svc = vi.hoisted(() => ({
  listPresets: vi.fn(),
  createFromPreset: vi.fn(),
  applyPreset: vi.fn(),
  applyItems: vi.fn(),
  listLibrary: vi.fn(),
  archivePreset: vi.fn(),
}));
const dept = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../../services/teamBuilder.service', async (orig) => ({
  ...(await orig<typeof BuilderService>()),
  teamBuilderService: svc,
}));
vi.mock('@/services/department.service', () => ({ departmentService: dept }));

const { NewTeamBuilder, slugOf } = await import('../NewTeamBuilder');
const { LibraryPicker, MAX_PICKS } = await import('../LibraryPicker');

const TeamProbe = () => {
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice ?? '';
  return (
    <p>
      team page {location.pathname} {notice}
    </p>
  );
};

const PRESET = {
  scope: 'platform',
  id: 3,
  key: 'support',
  name: 'Support desk',
  description: 'Everyday support rules',
  roles: ['generalRules'],
  itemCount: 12,
  flowCounts: {},
  source: 'builtin',
  retiredCount: 0,
};
const EMPTY_APPLY = {
  inserted: 12,
  alreadyPresent: 0,
  retired: 0,
  failed: [],
  rolesSet: [],
  previousHolders: [],
};
const item = (id: number, flow: string, extra = {}) => ({
  id,
  flow,
  name: `Rule ${id}`,
  description: 'Does a thing',
  purposeGroup: null,
  preview: null,
  ...extra,
});

const renderBuilder = () =>
  render(
    <MemoryRouter initialEntries={['/settings/teams/new']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/settings/teams/new" element={<NewTeamBuilder />} />
          <Route path="/settings/teams/:teamId" element={<TeamProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

const pickPresetAndName = async () => {
  fireEvent.click(await screen.findByText('Support desk'));
  fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Billing Team' } });
};

beforeEach(() => {
  vi.clearAllMocks();
  svc.listPresets.mockResolvedValue([PRESET]);
  svc.listLibrary.mockImplementation((params: { flow?: string; q?: string; page?: number }) =>
    Promise.resolve({
      items: params.flow === 'detection' ? [item(2, 'detection')] : [item(1, 'spam')],
      total: 120,
      page: params.page ?? 1,
      pageSize: 50,
      countsByFlow: { spam: 5, detection: 3, capability: 0 },
    })
  );
});

describe('NewTeamBuilder', () => {
  it('lists presets and From scratch; picking a preset and a name sends createFromPreset once even on a double click', async () => {
    svc.createFromPreset.mockResolvedValue({
      team: { id: 9, name: 'Billing Team' },
      apply: EMPTY_APPLY,
      notice: null,
      warnings: [],
    });
    renderBuilder();
    expect(await screen.findByText('From scratch')).toBeTruthy();
    await pickPresetAndName();
    expect(screen.getByText('12 rules from Support desk')).toBeTruthy();
    const create = screen.getByRole('button', { name: 'Create team' });
    fireEvent.click(create);
    fireEvent.click(create);
    await screen.findByTestId('apply-result-summary');
    expect(svc.createFromPreset).toHaveBeenCalledTimes(1);
    expect(svc.createFromPreset).toHaveBeenCalledWith({
      preset: { scope: 'platform', id: 3 },
      name: 'Billing Team',
      color: expect.any(String) as string,
    });
  });

  it('409 RolesHeldError opens the confirm; Move it here re-sends create with moveRoles', async () => {
    svc.createFromPreset
      .mockRejectedValueOnce(
        new RolesHeldError([{ role: 'generalRules', teamId: 1, teamName: 'Main' }])
      )
      .mockResolvedValueOnce({ team: { id: 9 }, apply: EMPTY_APPLY, notice: null, warnings: [] });
    renderBuilder();
    await pickPresetAndName();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move it here' }));
    await screen.findByTestId('apply-result-summary');
    expect(svc.createFromPreset).toHaveBeenCalledTimes(2);
    expect(svc.createFromPreset.mock.calls[1][0]).toMatchObject({ moveRoles: true });
  });

  it('a failed Move it here shows the error inside the dialog and keeps it open', async () => {
    svc.createFromPreset
      .mockRejectedValueOnce(
        new RolesHeldError([{ role: 'generalRules', teamId: 1, teamName: 'Main' }])
      )
      .mockRejectedValueOnce(new Error('boom'));
    renderBuilder();
    await pickPresetAndName();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move it here' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
    expect(within(dialog).getByRole('button', { name: 'Move it here' })).toBeTruthy();
    // Only the dialog shows it: the confirm step behind the dialog does not repeat it.
    const message = within(dialog).getByRole('alert').textContent ?? '';
    expect(screen.getAllByText(message)).toHaveLength(1);
  });

  it('a failed presets request says so instead of showing an empty list', async () => {
    svc.listPresets.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    renderBuilder();
    expect(await screen.findByText('The presets could not be loaded.')).toBeTruthy();
    // CONTROL: From scratch still works without presets.
    expect(screen.getByText('From scratch')).toBeTruthy();
  });

  it('a preset with one item says "1 rule", on the card and in the confirm line', async () => {
    svc.listPresets.mockResolvedValue([{ ...PRESET, itemCount: 1 }]);
    renderBuilder();
    expect(await screen.findByText('1 rule')).toBeTruthy();
    await pickPresetAndName();
    expect(screen.getByText('1 rule from Support desk')).toBeTruthy();
  });

  it('a create reply without the team says it was probably created, not that it failed', async () => {
    svc.createFromPreset.mockRejectedValue(new TeamNotReturnedError());
    renderBuilder();
    await pickPresetAndName();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByText(/The team was probably created/)).toBeTruthy();
    expect(screen.queryByText('The team could not be created.')).toBeNull();
    // A second click cannot make a second team.
    const create = screen.getByRole('button', { name: 'Create team' });
    expect(create).toBeInactive();
    fireEvent.click(create);
    expect(svc.createFromPreset).toHaveBeenCalledTimes(1);
  });

  it('a backend reason without a full stop still reads as its own sentence', async () => {
    dept.create.mockResolvedValue({ id: 7 });
    svc.applyItems.mockRejectedValue(
      Object.assign(new Error('refused'), {
        status: 400,
        response: { status: 400, data: { message: 'Too many ids' } },
      })
    );
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Ops' } });
    fireEvent.click(await screen.findByLabelText('Pick Rule 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    const alert = await screen.findByText(/its rules could not be added/);
    expect(alert.textContent).not.toMatch(/ids Open/);
  });

  it('a library with no rules says so; a search with no match says that', async () => {
    svc.listLibrary.mockImplementation((params: { q?: string }) =>
      Promise.resolve({ items: [], total: 0, page: 1, pageSize: 50, countsByFlow: {}, q: params.q })
    );
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    expect(await screen.findByText('The library has no rules.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No rules match.')).toBeTruthy();
    expect(screen.queryByText('The library has no rules.')).toBeNull();
  });

  it('409 then Keep it there creates nothing more and stays on the confirm step', async () => {
    svc.createFromPreset.mockRejectedValueOnce(
      new RolesHeldError([{ role: 'generalRules', teamId: 1, teamName: 'Main' }])
    );
    renderBuilder();
    await pickPresetAndName();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it there' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Move it here' })).toBeNull());
    expect(svc.createFromPreset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Create team' })).toBeTruthy();
  });

  it('201 with apply.error ROLES_HELD opens the confirm; Move it here sends applyPreset(team.id, preset, true) and no second create', async () => {
    svc.createFromPreset.mockResolvedValue({
      team: { id: 9, name: 'Billing Team' },
      apply: {
        error: 'ROLES_HELD',
        heldRoles: [{ role: 'generalRules', teamId: 1, teamName: 'Main' }],
      },
      notice: null,
      warnings: [],
    });
    svc.applyPreset.mockResolvedValue(EMPTY_APPLY);
    renderBuilder();
    await pickPresetAndName();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move it here' }));
    await screen.findByTestId('apply-result-summary');
    expect(svc.applyPreset).toHaveBeenCalledWith(9, { scope: 'platform', id: 3 }, true);
    expect(svc.createFromPreset).toHaveBeenCalledTimes(1);
  });

  it('from scratch: ticking two items on two flows, then Create, sends create then applyItems with both ids', async () => {
    dept.create.mockResolvedValue({ id: 7, name: 'Billing Team' });
    svc.applyItems.mockResolvedValue({ ...EMPTY_APPLY, inserted: 2 });
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Billing Team' } });
    fireEvent.click(await screen.findByLabelText('Pick Rule 1'));
    fireEvent.click(screen.getByText('Detection'));
    fireEvent.click(await screen.findByLabelText('Pick Rule 2'));
    expect(screen.getByText('2 rules picked')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    await screen.findByTestId('apply-result-summary');
    expect(dept.create).toHaveBeenCalledWith({
      name: 'Billing Team',
      slug: 'billing-team',
      color: expect.any(String) as string,
    });
    expect(svc.applyItems).toHaveBeenCalledWith(7, [1, 2]);
    // A new team says it routes on rules only until it sees mail, from scratch too.
    expect(screen.getByText(/This team starts with rules only/)).toBeTruthy();
  });

  it('a workspace preset can be removed after a confirm; a built-in one has no Remove; Cancel sends nothing', async () => {
    const own = { ...PRESET, scope: 'workspace', id: 41, key: 'own', name: 'Our desk', source: 'workspace' };
    svc.listPresets.mockResolvedValue([PRESET, own]);
    svc.archivePreset.mockResolvedValue(undefined);
    renderBuilder();
    await screen.findByText('Our desk');
    expect(screen.queryByRole('button', { name: 'Remove preset Support desk' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove preset Our desk' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(svc.archivePreset).not.toHaveBeenCalled();
    svc.listPresets.mockResolvedValue([PRESET]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove preset Our desk' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(svc.archivePreset).toHaveBeenCalledWith(41));
    await waitFor(() => expect(screen.queryByText('Our desk')).toBeNull());
  });

  it('removing the chosen workspace preset takes away its confirm step; another preset can be picked', async () => {
    const own = { ...PRESET, scope: 'workspace', id: 41, key: 'own', name: 'Our desk', source: 'workspace' };
    svc.listPresets.mockResolvedValue([PRESET, own]);
    svc.archivePreset.mockResolvedValue(undefined);
    renderBuilder();
    fireEvent.click(await screen.findByText('Our desk'));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Desk' } });
    expect(screen.getByRole('button', { name: 'Create team' })).toBeTruthy();
    svc.listPresets.mockResolvedValue([PRESET]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove preset Our desk' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText('Our desk')).toBeNull());
    // CONTROL: picking the built-in again brings the confirm step back.
    expect(screen.queryByRole('button', { name: 'Create team' })).toBeNull();
    fireEvent.click(screen.getByText('Support desk'));
    expect(screen.getByRole('button', { name: 'Create team' })).toBeTruthy();
  });

  it('a failed preset removal shows the backend reason and keeps the preset', async () => {
    const own = { ...PRESET, scope: 'workspace', id: 41, key: 'own', name: 'Our desk', source: 'workspace' };
    svc.listPresets.mockResolvedValue([own]);
    svc.archivePreset.mockRejectedValue(
      Object.assign(new Error('Preset not found'), { status: 404, data: { message: 'Preset not found' } })
    );
    renderBuilder();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove preset Our desk' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Preset not found')).toBeTruthy();
    expect(screen.getByText('Our desk')).toBeTruthy();
  });

  it('from scratch with no picks: the team is created and the new-team notice still shows', async () => {
    dept.create.mockResolvedValue({ id: 8, name: 'Empty Team' });
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Empty Team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByText('The team was created.')).toBeTruthy();
    // It has no rules, so it does not claim to start with rules.
    expect(screen.getByText(/This team has no rules yet/)).toBeTruthy();
    expect(screen.queryByText(/This team starts with rules only/)).toBeNull();
    expect(svc.applyItems).not.toHaveBeenCalled();
  });

  it('the picker pages and searches; an item with no description shows its preview; no capability tab', async () => {
    svc.listLibrary.mockImplementation((params: { page?: number; q?: string }) =>
      Promise.resolve({
        items: [
          item(params.page === 2 ? 60 : 1, 'spam', {
            description: '',
            preview: 'subject contains refund',
          }),
        ],
        total: 120,
        page: params.page ?? 1,
        pageSize: 50,
        countsByFlow: { spam: 5, capability: 4 },
      })
    );
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    expect(await screen.findByText('subject contains refund')).toBeTruthy();
    expect(screen.queryByText('Capability')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await screen.findByLabelText('Pick Rule 60');
    expect(svc.listLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 50 })
    );
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'refund' } });
    await waitFor(() =>
      expect(svc.listLibrary).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'refund', page: 1 })
      )
    );
  });

  it('403 PLAN_TEAM_LIMIT shows the server message and stays on the confirm step', async () => {
    dept.create.mockRejectedValue({
      response: {
        status: 403,
        data: { code: 'PLAN_TEAM_LIMIT', error: 'Your plan includes 1 team.' },
      },
    });
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Extra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByText(/Your plan includes 1 team/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create team' })).toBeTruthy();
  });

  it('after create: the result summary with the notice, and Open the team goes to /settings/teams/<id>', async () => {
    svc.createFromPreset.mockResolvedValue({
      team: { id: 9, name: 'Billing Team' },
      apply: EMPTY_APPLY,
      notice: 'rules_only_until_traffic',
      warnings: [],
    });
    renderBuilder();
    await pickPresetAndName();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByText(/starts with rules only/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open the team' }));
    expect(await screen.findByText(/team page \/settings\/teams\/9/)).toBeTruthy();
  });

  const raceReply = {
    team: { id: 9, name: 'Billing Team' },
    apply: {
      error: 'ROLES_HELD',
      heldRoles: [{ role: 'generalRules', teamId: 1, teamName: 'Main' }],
    },
    notice: null,
    warnings: [],
  };

  it('from scratch: applyItems rejecting with a 500 says the team was created, and Open the team shows; create ran once', async () => {
    dept.create.mockResolvedValue({ id: 7, name: 'Billing Team' });
    svc.applyItems.mockRejectedValue({ response: { status: 500, data: {} } });
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Billing Team' } });
    fireEvent.click(await screen.findByLabelText('Pick Rule 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(
      await screen.findByText(/The team was created, but its rules could not be added/)
    ).toBeTruthy();
    expect(screen.queryByText(/could not be created/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Open the team' })).toBeTruthy();
    expect(dept.create).toHaveBeenCalledTimes(1);
  });

  it('from scratch: no done screen or Open the team while applyItems is in flight', async () => {
    dept.create.mockResolvedValue({ id: 7, name: 'Billing Team' });
    let finish: (value: unknown) => void = () => undefined;
    svc.applyItems.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Billing Team' } });
    fireEvent.click(await screen.findByLabelText('Pick Rule 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    await waitFor(() => expect(svc.applyItems).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Open the team' })).toBeNull();
    await act(() => {
      finish({ ...EMPTY_APPLY, inserted: 1 });
      return Promise.resolve();
    });
    expect(await screen.findByRole('button', { name: 'Open the team' })).toBeTruthy();
  });

  it('the race, Keep it there: opens the team page with the not-applied notice and sends nothing more', async () => {
    svc.createFromPreset.mockResolvedValue(raceReply);
    renderBuilder();
    await pickPresetAndName();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it there' }));
    expect(
      await screen.findByText(
        /team page \/settings\/teams\/9 The preset was not applied because its roles are held\. Apply it from this page\./
      )
    ).toBeTruthy();
    expect(svc.applyPreset).not.toHaveBeenCalled();
  });

  it('the race, Move it here with applyPreset rejecting RolesHeldError: the dialog closes and the message shows', async () => {
    svc.createFromPreset.mockResolvedValue(raceReply);
    svc.applyPreset.mockRejectedValue(
      new RolesHeldError([{ role: 'generalRules', teamId: 2, teamName: 'Other' }])
    );
    renderBuilder();
    await pickPresetAndName();
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move it here' }));
    expect(
      await screen.findByText(/The team was created, but its rules could not be added/)
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Move it here' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Open the team' })).toBeTruthy();
  });

  it('two clicks inside one act send one create', async () => {
    svc.createFromPreset.mockResolvedValue({
      team: { id: 9 },
      apply: EMPTY_APPLY,
      notice: null,
      warnings: [],
    });
    renderBuilder();
    await pickPresetAndName();
    const create = screen.getByRole('button', { name: 'Create team' });
    await act(() => {
      create.click();
      create.click();
      return Promise.resolve();
    });
    await screen.findByTestId('apply-result-summary');
    expect(svc.createFromPreset).toHaveBeenCalledTimes(1);
  });

  it('a search that empties the active tab moves to the first tab left', async () => {
    svc.listLibrary.mockImplementation((params: { flow?: string; q?: string }) =>
      Promise.resolve({
        items: [item(params.q ? 2 : 1, params.q ? 'detection' : 'spam')],
        total: 1,
        page: 1,
        pageSize: 50,
        countsByFlow: params.q ? { detection: 1 } : { spam: 5, detection: 3 },
      })
    );
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    await screen.findByLabelText('Pick Rule 1');
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'x' } });
    await screen.findByLabelText('Pick Rule 2');
    await waitFor(() =>
      expect(svc.listLibrary).toHaveBeenLastCalledWith(
        expect.objectContaining({ flow: 'detection', q: 'x' })
      )
    );
    expect(screen.queryByText('Spam')).toBeNull();
  });

  it('no "No rules match." while the replacing tab loads after a search empties the active one', async () => {
    svc.listLibrary.mockImplementation((params: { flow?: string; q?: string }) => {
      if (params.q && params.flow === 'detection') return new Promise(() => {});
      return Promise.resolve({
        items: params.q ? [] : [item(1, 'spam')],
        total: params.q ? 0 : 1,
        page: 1,
        pageSize: 50,
        countsByFlow: params.q ? { spam: 0, detection: 3 } : { spam: 5, detection: 3 },
      });
    });
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    await screen.findByLabelText('Pick Rule 1');
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'x' } });
    await waitFor(() =>
      expect(svc.listLibrary).toHaveBeenLastCalledWith(
        expect.objectContaining({ flow: 'detection', q: 'x' })
      )
    );
    expect(screen.queryByText('No rules match.')).toBeNull();
  });

  it('the first library request asks for the first flow', async () => {
    renderBuilder();
    fireEvent.click(await screen.findByText('From scratch'));
    await screen.findByLabelText('Pick Rule 1');
    expect(svc.listLibrary.mock.calls[0][0]).toMatchObject({ flow: 'spam' });
  });
});

describe('slugOf', () => {
  it('caps at 50, trims dashes, and falls back to team', () => {
    expect(slugOf('A'.repeat(60))).toBe('a'.repeat(50));
    expect(slugOf(`${'a'.repeat(49)} bbb`)).toBe('a'.repeat(49));
    expect(slugOf('  --Billing & Co!!  ')).toBe('billing-co');
    expect(slugOf('日本語 !!!')).toBe('team');
  });
});

describe('LibraryPicker cap', () => {
  const renderPicker = (selected: Set<number>, onChange = vi.fn()) => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LibraryPicker selected={selected} onChange={onChange} />
      </QueryClientProvider>
    );
    return onChange;
  };

  it('counts the picks against the cap', async () => {
    renderPicker(new Set([1]));
    expect(await screen.findByText(`1 of ${MAX_PICKS} picked`)).toBeTruthy();
  });

  it('at the cap an unpicked rule cannot be added, a picked one can still be removed', async () => {
    // Rule 1 is not among the picks; Rule 2 (detection tab) is.
    const full = new Set(Array.from({ length: MAX_PICKS }, (_, idx) => idx + 2));
    const onChange = renderPicker(full);
    expect(await screen.findByText(/the most one request takes/)).toBeTruthy();
    const unpicked = await screen.findByLabelText('Pick Rule 1');
    // Announced as unavailable, and why.
    expect(unpicked).toHaveAttribute('aria-disabled', 'true');
    expect(unpicked).toHaveAttribute('aria-describedby', 'library-picker-cap');
    fireEvent.click(unpicked);
    expect(onChange).not.toHaveBeenCalled();
    // CONTROL: removing a pick still works at the cap.
    fireEvent.click(screen.getByText('Detection'));
    fireEvent.click(await screen.findByLabelText('Pick Rule 2'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as Set<number>).has(2)).toBe(false);
  });
});
