import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { TeamPresetsService, ConsolePreset } from '@/features/rule-library/services/teamPresets.service';
import type { RuleLibraryItem, RuleLibraryList, RuleLibraryService } from '@/features/rule-library/services/ruleLibrary.service';
import { PLATFORM_SECTIONS } from '@/components/console/consoleSections';
import { PAYLOAD_FIELDS } from '@/features/rule-library/payloadFields';
import { apiError } from '@/test/apiError';
import { listOptions } from '@/test/chooseOption';

const preset = (over: Partial<ConsolePreset> = {}): ConsolePreset => ({
  id: 5,
  key: 'warehouse',
  name: 'Warehouse team',
  description: 'Parcels and stock',
  roles: ['generalRules', 'billingExtraction'],
  itemCount: 4,
  flowCounts: { routing: 3, spam: 1 },
  retiredCount: 0,
  source: 'admin',
  active: true,
  updatedAt: '2026-11-02T10:00:00.000Z',
  ...over,
});
const libItem = (over: Partial<RuleLibraryItem>): RuleLibraryItem => ({
  id: 1, flow: 'routing', seedKey: 'routing:a', originPresetKey: null, name: 'Parcel subject', description: '',
  purposeGroup: null, payload: {}, hasEmbedding: false, embeddingModel: null, source: 'seed', active: true,
  createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z', updatedBy: null, ...over,
});

const listPresets = vi.fn<TeamPresetsService['listTeamPresets']>();
const createPreset = vi.fn<TeamPresetsService['createTeamPreset']>();
const updatePreset = vi.fn<TeamPresetsService['updateTeamPreset']>();
vi.mock('@/features/rule-library/services/teamPresets.service', async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  listTeamPresets: (...args: Parameters<TeamPresetsService['listTeamPresets']>) => listPresets(...args),
  createTeamPreset: (...args: Parameters<TeamPresetsService['createTeamPreset']>) => createPreset(...args),
  updateTeamPreset: (...args: Parameters<TeamPresetsService['updateTeamPreset']>) => updatePreset(...args),
}));
const listItems = vi.fn<RuleLibraryService['listLibraryItems']>();
vi.mock('@/features/rule-library/services/ruleLibrary.service', async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  listLibraryItems: (...args: Parameters<RuleLibraryService['listLibraryItems']>) => listItems(...args),
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

const { PlatformTeamPresets } = await import('../PlatformTeamPresets');
const renderPage = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PlatformTeamPresets />
      </QueryClientProvider>
    </MemoryRouter>
  );
const libList = (items: RuleLibraryItem[]): RuleLibraryList => ({
  items, total: items.length, page: 1, pageSize: 100, countsByFlow: {} as RuleLibraryList['countsByFlow'],
});

afterEach(cleanup);
beforeEach(() => {
  flags = { 'ui.rule_library_console': true };
  listPresets.mockReset().mockResolvedValue([preset()]);
  createPreset.mockReset().mockResolvedValue(preset());
  updatePreset.mockReset().mockResolvedValue(preset());
  listItems.mockReset().mockResolvedValue(
    libList([
      libItem({ id: 1, seedKey: 'routing:a', name: 'Parcel subject' }),
      libItem({ id: 2, seedKey: null, name: 'Admin-made, no seed key' }),
    ])
  );
});

describe('Team presets console', () => {
  it('lists presets with item and role counts', async () => {
    renderPage();
    expect(await screen.findByText('Warehouse team')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText(/General rules, Billing details/)).toBeTruthy();
  });

  it('create sends roles and items as { librarySeedKey } only', async () => {
    renderPage();
    await screen.findByText('Warehouse team');
    fireEvent.click(screen.getByRole('button', { name: 'New preset' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Returns' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Promotional mail' }));
    fireEvent.click(await screen.findByLabelText('Parcel subject'));
    expect(screen.queryByLabelText('Admin-made, no seed key')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(createPreset).toHaveBeenCalled());
    const sent = createPreset.mock.calls[0][0];
    expect(sent.roles).toEqual(['receivesPromotional']);
    expect(sent.items).toEqual([{ librarySeedKey: 'routing:a' }]);
    expect(sent.name).toBe('Returns');
    expect('key' in sent).toBe(false);
  });

  it('never offers capability items: the Flow options exclude it and the library is never asked for it', async () => {
    renderPage();
    await screen.findByText('Warehouse team');
    fireEvent.click(screen.getByRole('button', { name: 'New preset' }));
    await screen.findByLabelText('Parcel subject');
    const options = await listOptions(screen.getByLabelText('Flow'));
    expect(options).toContain('Routing');
    expect(options).not.toContain('Capability');
    expect(listItems.mock.calls.every(([params]) => params.flow !== 'capability')).toBe(true);
  });

  it('create still needs at least one item', async () => {
    renderPage();
    await screen.findByText('Warehouse team');
    fireEvent.click(screen.getByRole('button', { name: 'New preset' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Returns' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeInactive();
  });

  it('edit with no items picked keeps the current items: the PATCH has no items key', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByText('Leave the items empty to keep the current 4, or pick items to replace them all.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updatePreset).toHaveBeenCalled());
    const sent = updatePreset.mock.calls[0][1];
    expect(sent.name).toBe('Renamed');
    expect('items' in sent).toBe(false);
  });

  it('edit with two items picked sends exactly those two', async () => {
    listItems.mockResolvedValue(
      libList([libItem({ id: 1, seedKey: 'routing:a', name: 'Parcel subject' }), libItem({ id: 3, seedKey: 'routing:b', name: 'Stock subject' })])
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(await screen.findByLabelText('Parcel subject'));
    fireEvent.click(await screen.findByLabelText('Stock subject'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updatePreset).toHaveBeenCalled());
    expect(updatePreset.mock.calls[0][1].items).toEqual([{ librarySeedKey: 'routing:a' }, { librarySeedKey: 'routing:b' }]);
  });

  it('after a stale save the draft takes the new updatedAt and the retry sends it', async () => {
    updatePreset.mockRejectedValueOnce(await apiError(409, { success: false, error: 'Preset changed since it was loaded', code: 'STALE_ITEM' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await screen.findByLabelText('Name');
    listPresets.mockResolvedValue([preset({ updatedAt: '2026-11-03T09:00:00.000Z' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Preset changed since it was loaded')).toBeTruthy();
    await waitFor(() => expect(listPresets.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeInactive());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updatePreset).toHaveBeenCalledTimes(2));
    expect(updatePreset.mock.calls[1][1].updatedAt).toBe('2026-11-03T09:00:00.000Z');
  });

  it('archive sends active false with updatedAt and no items', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(updatePreset).toHaveBeenCalled());
    expect(updatePreset.mock.calls[0][1]).toEqual({ updatedAt: '2026-11-02T10:00:00.000Z', active: false });
  });

  it('409 STALE_ITEM shows the message and reloads', async () => {
    updatePreset.mockRejectedValue(await apiError(409, { success: false, error: 'Preset changed since it was loaded', code: 'STALE_ITEM' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Preset changed since it was loaded')).toBeTruthy();
    await waitFor(() => expect(listPresets.mock.calls.length).toBeGreaterThan(1));
  });

  it.each([
    ['PRESET_INVALID', 400, 'Items must reference library items'],
    ['PRESET_KEY_TAKEN', 409, 'A preset with this name exists'],
  ])('%s shows the server message', async (code, status, message) => {
    createPreset.mockRejectedValue(await apiError(status, { success: false, error: message, code }));
    renderPage();
    await screen.findByText('Warehouse team');
    fireEvent.click(screen.getByRole('button', { name: 'New preset' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(await screen.findByLabelText('Parcel subject'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(message)).toBeTruthy();
  });

  it('the nav entry carries the flag and the page is unavailable with it off', () => {
    expect(PLATFORM_SECTIONS.find((section) => section.id === 'team-presets')?.flag).toBe('ui.rule_library_console');
    flags = {};
    renderPage();
    expect(screen.queryByRole('button', { name: 'New preset' })).toBeNull();
    expect(listPresets).not.toHaveBeenCalled();
  });
});

describe('Rule library routing form', () => {
  it('the routing Match type options include sender_email, before sender_domain', () => {
    const type = PAYLOAD_FIELDS.routing.find((field) => field.key === 'type');
    expect(type?.options).toContain('sender_email');
    const opts = type?.options ?? [];
    expect(opts.indexOf('sender_email')).toBe(opts.indexOf('subject_regex') + 1);
  });
});
