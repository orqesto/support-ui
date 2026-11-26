/**
 * An editor reopened on a row whose earlier save is still in flight.
 *
 * Save row 1, Cancel, reopen row 1 before the answer: the form shows the old values. When the
 * earlier save then succeeds, saving that form would write the old values back and silently undo
 * it. So the reopened editor waits for that write (and says why), then takes the saved values if
 * the person has not typed, or keeps their text and says the row changed underneath. Only that
 * row waits. The REAL pages, services and api-client run; the api-client answers 2xx with the
 * saved row, after a gate the test controls.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import type * as SettingsServiceModule from '@/services/settings.service';

const net = vi.hoisted(() => ({
  /** When set, a write waits for it before answering (a request still in flight). */
  gate: null as Promise<void> | null,
  /** The 2xx body every write answers with. */
  body: undefined as unknown,
  /** Every write sent, in order. */
  sent: [] as { url: string; body: { name?: string } }[],
  spam: [] as unknown[],
  categories: [] as unknown[],
}));

vi.mock('@/services/settings.service', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsServiceModule>();
  return {
    ...actual,
    settingsService: {
      ...actual.settingsService,
      getSpamRules: () => Promise.resolve(net.spam as SettingsServiceModule.SpamRule[]),
      getCategories: () => Promise.resolve(net.categories as SettingsServiceModule.Category[]),
    },
  };
});
vi.mock('@/lib/toast', () => ({
  toast: { error: () => undefined, failure: () => undefined, success: () => undefined },
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock('../FeatureSuggestions', () => ({ FeatureSuggestions: () => null }));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { SpamRulesSettings } from '@/features/settings/components/SpamRulesSettings';
import { CategoriesSettings } from '@/features/settings/components/CategoriesSettings';
import { apiClient } from '@/lib/api-client';

const SPAM_RULE = (id: number, name: string): SettingsServiceModule.SpamRule => ({
  id,
  organizationId: 1,
  name,
  description: `${name} description`,
  pattern: 'x',
  exampleText: null,
  category: 'transactional',
  matchField: 'subject',
  severity: 10,
  active: true,
  departmentId: null,
  createdAt: '2026-10-07T00:00:00Z',
  updatedAt: '2026-10-07T00:00:00Z',
});
const CATEGORY = (id: number, name: string): SettingsServiceModule.Category => ({
  id,
  name,
  description: 'd',
  keywords: 'k',
  departmentId: null,
  createdAt: '',
  updatedAt: '',
});

const EDIT_PAGES = [
  {
    label: 'spam rules',
    page: () => <SpamRulesSettings />,
    seed: () => {
      net.spam = [SPAM_RULE(1, 'rule_a'), SPAM_RULE(2, 'rule_b')];
    },
    editButtons: () => screen.getAllByLabelText('Edit rule'),
    nameShown: (name: string) => screen.queryByDisplayValue(name) !== null,
    names: ['rule_a', 'rule_b'] as const,
  },
  {
    label: 'categories',
    page: () => <CategoriesSettings />,
    seed: () => {
      net.categories = [CATEGORY(1, 'Alpha'), CATEGORY(2, 'Beta')];
    },
    editButtons: () => screen.getAllByRole('button', { name: /^edit$/i }),
    nameShown: (name: string) => screen.queryByDisplayValue(name) !== null,
    names: ['Alpha', 'Beta'] as const,
  },
];

beforeEach(() => {
  net.gate = null;
  net.body = undefined;
  net.sent = [];
  net.spam = [];
  net.categories = [];
  const answer = (url: unknown, body: unknown) => {
    net.sent.push({ url: String(url), body: body as { name?: string } });
    return (net.gate ?? Promise.resolve()).then(() => ({ data: net.body, status: 200 }));
  };
  vi.spyOn(apiClient, 'put').mockImplementation(answer as never);
  vi.spyOn(apiClient, 'patch').mockImplementation(answer as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
/** Let a released request and its follow-up renders settle. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe.each(EDIT_PAGES)('$label: a row reopened while its save is in flight', (edit) => {
  const row = (name: string) =>
    edit.label === 'categories' ? CATEGORY(1, name) : SPAM_RULE(1, name);
  const other = () => (edit.label === 'categories' ? CATEGORY(2, 'Beta') : SPAM_RULE(2, 'rule_b'));
  /** The server now holds `name` for row 1: what a list reload returns. */
  const serverHolds = (name: string) => {
    if (edit.label === 'categories') net.categories = [row(name), other()];
    else net.spam = [row(name), other()];
  };
  const writes = () => net.sent.map((write) => ({ url: write.url, name: write.body.name }));
  const saveButton = () => screen.getByRole('button', { name: /^save$/i });
  const isDisabled = (button: HTMLElement) =>
    button.getAttribute('aria-disabled') === 'true' || (button as HTMLButtonElement).disabled;

  /** Rename row 1 and Save (held in flight), Cancel, reopen row 1. Returns the release. */
  const reopenWhileSaving = async () => {
    edit.seed();
    render(edit.page());
    await waitFor(() => expect(edit.editButtons().length).toBeGreaterThan(1));
    fireEvent.click(edit.editButtons()[0]);
    fireEvent.change(screen.getByDisplayValue(edit.names[0]), { target: { value: 'renamed_row' } });
    let release: () => void = () => undefined;
    net.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
        net.body = { success: true, data: row('renamed_row') };
    fireEvent.click(saveButton());
    await waitFor(() => expect(net.sent.length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(edit.editButtons()[0]);
    return () => {
      net.gate = null;
      serverHolds('renamed_row');
      act(() => {
        release();
      });
    };
  };

  it('waits for the earlier save, says why, and sends nothing meanwhile', async () => {
    const release = await reopenWhileSaving();
    expect(screen.getByText(/Saving your earlier change to this/)).toBeTruthy();
    expect(isDisabled(saveButton())).toBe(true);
    fireEvent.click(saveButton());
    await settle();
    expect(net.sent.length).toBe(1);
    release();
    await settle();
    expect(screen.queryByText(/Saving your earlier change/)).toBeNull();
    expect(isDisabled(saveButton())).toBe(false);
  });

  it('an untouched form takes the saved values, so a second Save never writes the old ones back', async () => {
    const release = await reopenWhileSaving();
    expect(edit.nameShown(edit.names[0])).toBe(true);
    release();
    await settle();
    // The form now shows what the earlier save stored; no message, nothing for the person to do.
    expect(edit.nameShown('renamed_row')).toBe(true);
    expect(edit.nameShown(edit.names[0])).toBe(false);
    expect(screen.queryByText(/just saved with other values/)).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1].name).toBe('renamed_row');
    await settle();
    // End state: the editor closed and the list shows the rename.
    expect(screen.queryByText(/just saved with other values/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(screen.getAllByText('renamed_row').length).toBeGreaterThan(0);
  });

  it('a form the person typed in keeps their text, says the row changed, and their Save wins', async () => {
    const release = await reopenWhileSaving();
    fireEvent.change(screen.getByDisplayValue(edit.names[0]), { target: { value: 'typed_name' } });
    release();
    await settle();
    expect(edit.nameShown('typed_name')).toBe(true);
    expect(screen.getByText(/was just saved with other values\. Saving now replaces them\./)).toBeTruthy();
    expect(isDisabled(saveButton())).toBe(false);
    // The last write the person asked for is the one sent last; no two writes of the row overlap.
    net.body = { success: true, data: row('typed_name') };
    serverHolds('typed_name');
    fireEvent.click(saveButton());
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes().map((write) => write.name)).toEqual(['renamed_row', 'typed_name']);
    await settle();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(screen.getAllByText('typed_name').length).toBeGreaterThan(0);
  });

  it('an editor on ANOTHER row saves at once, with no waiting line', async () => {
    const release = await reopenWhileSaving();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(edit.editButtons()[1]);
    expect(screen.queryByText(/Saving your earlier change/)).toBeNull();
    expect(isDisabled(saveButton())).toBe(false);
    release();
    await settle();
    // The other row's form is not touched by row 1's late answer.
    expect(edit.nameShown(edit.names[1])).toBe(true);
    expect(screen.queryByText(/just saved with other values/)).toBeNull();
  });

  it("row 1's late answer does not end ANOTHER row's own save in flight", async () => {
    const release = await reopenWhileSaving();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(edit.editButtons()[1]);
    let releaseOther: () => void = () => undefined;
    net.gate = new Promise<void>((resolve) => {
      releaseOther = resolve;
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(net.sent.length).toBe(2));
    const otherGate = net.gate;
    release();
    net.gate = otherGate;
    await settle();
    expect(isDisabled(saveButton())).toBe(true);
    fireEvent.click(saveButton());
    await settle();
    expect(net.sent.length).toBe(2);
    net.gate = null;
    act(() => {
      releaseOther();
    });
    await settle();
  });

  it('closing the waiting editor clears its line, also when the row is reopened later', async () => {
    const release = await reopenWhileSaving();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText(/Saving your earlier change/)).toBeNull();
    release();
    await settle();
    expect(screen.queryByText(/just saved with other values/)).toBeNull();
    // Reopened after the earlier save answered: nothing to wait for, no leftover line.
    fireEvent.click(edit.editButtons()[0]);
    expect(screen.queryByText(/Saving your earlier change/)).toBeNull();
    expect(isDisabled(saveButton())).toBe(false);
    expect(edit.nameShown('renamed_row')).toBe(true);
  });
});
