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
import { render, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';
import { apiError } from '@/test/apiError';
import type * as SettingsServiceModule from '@/services/settings.service';

const net = vi.hoisted(() => ({
  /** When set, a write waits for it before answering (a request still in flight). */
  gate: null as Promise<void> | null,
  /** The 2xx body every write answers with. */
  body: undefined as unknown,
  /** Every write sent, in order. */
  sent: [] as { url: string; method: string; body: { name?: string; active?: boolean } }[],
  spam: [] as unknown[],
  categories: [] as unknown[],
  /** When set, writes are refused with it (after the gate). */
  error: null as unknown,
  /** When true, a list (re)load fails. */
  listFails: false,
  toasts: [] as string[],
}));
const listed = <T,>(rows: unknown[]): Promise<T[]> =>
  net.listFails ? Promise.reject(new Error('Network Error')) : Promise.resolve(rows as T[]);

vi.mock('@/services/settings.service', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsServiceModule>();
  return {
    ...actual,
    settingsService: {
      ...actual.settingsService,
      getSpamRules: () => listed<SettingsServiceModule.SpamRule>(net.spam),
      getCategories: () => listed<SettingsServiceModule.Category>(net.categories),
    },
  };
});
vi.mock('@/lib/toast', () => ({
  toast: {
    error: (message: string) => net.toasts.push(message),
    failure: (scope: string) => net.toasts.push(scope),
    success: () => undefined,
  },
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

const DUPLICATE_RULE_TEXT = 'A rule with this name already exists here';
const reloadFailed = (label: string) =>
  label === 'categories'
    ? 'Could not reload the categories, so the list may be out of date. Editing reloads it first.'
    : 'Could not reload the rules, so the list may be out of date. Editing reloads it first.';

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
  net.error = null;
  net.listFails = false;
  net.toasts = [];
  const answer = (method: string) => (url: unknown, body: unknown) => {
    net.sent.push({ url: String(url), method, body: body as { name?: string } });
    return (net.gate ?? Promise.resolve()).then(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- whatever the test set
      net.error ? Promise.reject(net.error) : { data: net.body, status: 200 }
    );
  };
  vi.spyOn(apiClient, 'put').mockImplementation(answer('put') as never);
  vi.spyOn(apiClient, 'patch').mockImplementation(answer('patch') as never);
  vi.spyOn(apiClient, 'post').mockImplementation(answer('post') as never);
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
    /** Let the earlier save answer: success (the server holds the rename), or `failure`. */
    return (failure?: unknown) => {
      net.gate = null;
      if (failure) net.error = failure;
      else serverHolds('renamed_row');
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

  it.each([
    [
      'a 409',
      () => apiError(409, { success: false, code: 'DUPLICATE_RULE', error: DUPLICATE_RULE_TEXT }),
      (label: string) =>
        label === 'categories' ? 'A category with this name already exists here' : DUPLICATE_RULE_TEXT,
    ],
    [
      'a 500',
      () => apiError(500, { success: false, error: 'SELECT failed' }),
      (label: string) =>
        label === 'categories'
          ? 'Could not save the category. Try again.'
          : 'Could not save the rule. Try again.',
    ],
    [
      'a network drop',
      () =>
        Promise.resolve(
          Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' })
        ),
      (label: string) =>
        label === 'categories'
          ? 'Could not save the category. Try again.'
          : 'Could not save the rule. Try again.',
    ],
  ])('the earlier save failing (%s) says so in the reopened editor and lets it save', async (_label, failure, reason) => {
    const error = await failure();
    const release = await reopenWhileSaving();
    release(error);
    await settle();
    expect(screen.queryByText(/Saving your earlier change/)).toBeNull();
    expect(screen.getByText(`Your earlier change was not saved. ${reason(edit.label)}`)).toBeTruthy();
    expect(isDisabled(saveButton())).toBe(false);
    // Nothing stale was written: the only write is the failed one.
    expect(net.sent).toHaveLength(1);
  });

  it('a failed list reload is shown, and Edit reloads before it opens a form', async () => {
    edit.seed();
    render(edit.page());
    await waitFor(() => expect(edit.editButtons().length).toBeGreaterThan(1));
    fireEvent.click(edit.editButtons()[0]);
    fireEvent.change(screen.getByDisplayValue(edit.names[0]), { target: { value: 'renamed_row' } });
    net.body = { success: true, data: row('renamed_row') };
    net.listFails = true;
    fireEvent.click(saveButton());
    await settle();
    // Saved, but the list could not reload: it still shows the old name, and says so.
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(net.toasts).toEqual([reloadFailed(edit.label)]);
    serverHolds('renamed_row');
    // Edit while the reload still fails: no form opens from the stale row.
    fireEvent.click(edit.editButtons()[0]);
    await settle();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(net.toasts).toEqual([reloadFailed(edit.label), reloadFailed(edit.label)]);
    // Once the reload works, Edit opens the fresh row.
    net.listFails = false;
    fireEvent.click(edit.editButtons()[0]);
    await settle();
    expect(edit.nameShown('renamed_row')).toBe(true);
    expect(edit.nameShown(edit.names[0])).toBe(false);
  });
});

describe('categories: the create form never saves the category being edited', () => {
  it('Save in the create form while the edit form waits sends no write of that category', async () => {
    net.categories = [CATEGORY(1, 'Alpha'), CATEGORY(2, 'Beta')];
    render(<CategoriesSettings />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^edit$/i }).length).toBe(2));
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 'renamed_row' } });
    let release: () => void = () => undefined;
    net.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    net.body = { success: true, data: CATEGORY(1, 'renamed_row') };
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(net.sent).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(screen.getByRole('button', { name: /add category/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    expect(screen.getByText(/Saving your earlier change to this category/)).toBeTruthy();
    const createForm = screen.getByText('New Category').parentElement as HTMLElement;
    fireEvent.change(within(createForm).getByPlaceholderText('e.g., Technical Support'), {
      target: { value: 'Shipping' },
    });
    fireEvent.click(within(createForm).getByRole('button', { name: /^save$/i }));
    await settle();
    // The create form created from its own values; the category being edited got no second write.
    expect(net.sent.filter((write) => write.url.endsWith('/categories/1'))).toHaveLength(1);
    const posts = net.sent.filter((write) => write.method === 'post');
    expect(posts.map((write) => write.body.name)).toEqual(['Shipping']);
    net.gate = null;
    act(() => {
      release();
    });
    await settle();
  });
});

describe('categories: the create and edit forms are independent', () => {
  const openBoth = async () => {
    net.categories = [CATEGORY(1, 'Alpha'), CATEGORY(2, 'Beta')];
    render(<CategoriesSettings />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^edit$/i }).length).toBe(2));
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /add category/i }));
    const createForm = () => screen.getByText('New Category').parentElement as HTMLElement;
    const editForm = () => screen.getByText('Edit Category').parentElement as HTMLElement;
    return { createForm, editForm };
  };
  const nameIn = (form: HTMLElement) => within(form).getAllByRole('textbox')[0] as HTMLInputElement;

  it('each form keeps its own values: opening or typing in one never changes the other', async () => {
    const { createForm, editForm } = await openBoth();
    // Before: the create form showed the edited category's values (one shared form state).
    expect(nameIn(createForm()).value).toBe('');
    expect(nameIn(editForm()).value).toBe('Alpha');
    fireEvent.change(nameIn(createForm()), { target: { value: 'Shipping' } });
    fireEvent.change(nameIn(editForm()), { target: { value: 'Alpha renamed' } });
    expect(nameIn(createForm()).value).toBe('Shipping');
    expect(nameIn(editForm()).value).toBe('Alpha renamed');
  });

  it('opening Edit while the create form has text keeps that text', async () => {
    net.categories = [CATEGORY(1, 'Alpha'), CATEGORY(2, 'Beta')];
    render(<CategoriesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /add category/i }));
    const createForm = () => screen.getByText('New Category').parentElement as HTMLElement;
    fireEvent.change(nameIn(createForm()), { target: { value: 'Shipping' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    expect(nameIn(createForm()).value).toBe('Shipping');
    const editForm = screen.getByText('Edit Category').parentElement as HTMLElement;
    expect(nameIn(editForm).value).toBe('Alpha');
  });

  it('opening the create form while an edit save is in flight does not stop that save closing its form', async () => {
    net.categories = [CATEGORY(1, 'Alpha'), CATEGORY(2, 'Beta')];
    render(<CategoriesSettings />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^edit$/i }).length).toBe(2));
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    const editForm = screen.getByText('Edit Category').parentElement as HTMLElement;
    fireEvent.change(nameIn(editForm), { target: { value: 'Alpha renamed' } });
    let release: () => void = () => undefined;
    net.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    net.body = { success: true, data: CATEGORY(1, 'Alpha renamed') };
    fireEvent.click(within(editForm).getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(net.sent).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /add category/i }));
    net.categories = [CATEGORY(1, 'Alpha renamed'), CATEGORY(2, 'Beta')];
    net.gate = null;
    act(() => {
      release();
    });
    await settle();
    // The edit was saved and its form closed; the create form stays open.
    expect(screen.queryByText('Edit Category')).toBeNull();
    expect(screen.getByText('New Category')).toBeTruthy();
  });

  it("each form's Cancel closes only that form", async () => {
    const { createForm, editForm } = await openBoth();
    fireEvent.change(nameIn(editForm()), { target: { value: 'Alpha renamed' } });
    fireEvent.click(within(createForm()).getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText('New Category')).toBeNull();
    expect(nameIn(editForm()).value).toBe('Alpha renamed');
    fireEvent.click(screen.getByRole('button', { name: /add category/i }));
    fireEvent.change(nameIn(createForm()), { target: { value: 'Shipping' } });
    fireEvent.click(within(editForm()).getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText('Edit Category')).toBeNull();
    expect(nameIn(createForm()).value).toBe('Shipping');
  });

  it("each form's Save sends its own values and closes only that form", async () => {
    const { createForm, editForm } = await openBoth();
    fireEvent.change(nameIn(createForm()), { target: { value: 'Shipping' } });
    fireEvent.change(nameIn(editForm()), { target: { value: 'Alpha renamed' } });
    net.body = { success: true, data: CATEGORY(3, 'Shipping') };
    net.categories = [CATEGORY(1, 'Alpha'), CATEGORY(2, 'Beta'), CATEGORY(3, 'Shipping')];
    fireEvent.click(within(createForm()).getByRole('button', { name: /^save$/i }));
    await settle();
    expect(net.sent.map((write) => [write.method, write.body.name])).toEqual([['post', 'Shipping']]);
    expect(screen.queryByText('New Category')).toBeNull();
    expect(nameIn(editForm()).value).toBe('Alpha renamed');
    net.body = { success: true, data: CATEGORY(1, 'Alpha renamed') };
    fireEvent.click(within(editForm()).getByRole('button', { name: /^save$/i }));
    await settle();
    expect(net.sent.map((write) => [write.method, write.url, write.body.name])).toEqual([
      ['post', '/api/settings/categories', 'Shipping'],
      ['put', '/api/settings/categories/1', 'Alpha renamed'],
    ]);
    expect(screen.queryByText('Edit Category')).toBeNull();
  });
});

describe('spam rules: the on/off switch and the editor never write one rule at once', () => {
  const switches = () => screen.getAllByRole('button', { name: /^active$/i });
  const isDisabled = (button: HTMLElement) =>
    button.getAttribute('aria-disabled') === 'true' || (button as HTMLButtonElement).disabled;
  const hold = () => {
    let release: () => void = () => undefined;
    net.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      net.gate = null;
      act(() => {
        release();
      });
    };
  };

  it("a rule's switch waits for its save, then sends only the flag", async () => {
    net.spam = [SPAM_RULE(1, 'rule_a'), SPAM_RULE(2, 'rule_b')];
    render(<SpamRulesSettings />);
    fireEvent.click((await screen.findAllByLabelText('Edit rule'))[0]);
    fireEvent.change(screen.getByDisplayValue('rule_a'), { target: { value: 'renamed_row' } });
    const release = hold();
    net.body = { success: true, data: SPAM_RULE(1, 'renamed_row') };
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(net.sent).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    // Rule 1's switch waits; rule 2's does not.
    expect(isDisabled(switches()[0])).toBe(true);
    fireEvent.click(switches()[0]);
    await settle();
    expect(net.sent).toHaveLength(1);
    expect(isDisabled(switches()[1])).toBe(false);
    net.spam = [SPAM_RULE(1, 'renamed_row'), SPAM_RULE(2, 'rule_b')];
    release();
    await settle();
    expect(isDisabled(switches()[0])).toBe(false);
    net.body = { success: true, data: { ...SPAM_RULE(1, 'renamed_row'), active: false } };
    fireEvent.click(switches()[0]);
    await waitFor(() => expect(net.sent).toHaveLength(2));
    expect(net.sent[1].body).toEqual({ active: false });
  });

  it('an editor opened while the switch is in flight waits, then saves the switched value', async () => {
    net.spam = [SPAM_RULE(1, 'rule_a'), SPAM_RULE(2, 'rule_b')];
    render(<SpamRulesSettings />);
    await screen.findAllByLabelText('Edit rule');
    const release = hold();
    net.body = { success: true, data: { ...SPAM_RULE(1, 'rule_a'), active: false } };
    fireEvent.click(switches()[0]);
    await waitFor(() => expect(net.sent).toHaveLength(1));
    fireEvent.click(screen.getAllByLabelText('Edit rule')[0]);
    expect(screen.getByText(/Saving your earlier change to this rule/)).toBeTruthy();
    expect(isDisabled(screen.getByRole('button', { name: /^save$/i }))).toBe(true);
    net.spam = [{ ...SPAM_RULE(1, 'rule_a'), active: false }, SPAM_RULE(2, 'rule_b')];
    release();
    await settle();
    // The untouched form took the switched row: its Save does not switch the rule back on.
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(net.sent).toHaveLength(2));
    expect(net.sent[1].body.active).toBe(false);
  });
});
