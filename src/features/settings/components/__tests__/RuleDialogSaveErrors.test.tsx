/**
 * A refused save in a rule dialog shows the server's reason inside the dialog.
 *
 * The shared hook used to log the failure and rethrow, so an admin who hit a duplicate name (409)
 * or a validation refusal (400) saw nothing: the dialog just sat there. These tests drive the REAL
 * pages and dialogs; only the services are replaced, and the stand-ins are built from the real
 * service objects so their signatures cannot drift.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import type * as SettingsServiceModule from '@/services/settings.service';
import type * as DetectionServiceModule from '@/features/settings/services/detectionRule.service';
import type * as PriorityServiceModule from '@/features/settings/services/priorityRule.service';

/** What the next create/update call does: reject with this, or resolve when null. */
const next = vi.hoisted(() => ({
  error: null as unknown,
  saves: 0,
  /** When set, a save waits for it before answering (a request still in flight). */
  gate: null as Promise<void> | null,
  spam: [] as unknown[],
  categories: [] as unknown[],
}));
const attempt = <T,>(value: T): Promise<T> => {
  next.saves += 1;
  return (next.gate ?? Promise.resolve()).then(() =>
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the stand-in rejects with whatever the test set
    next.error ? Promise.reject(next.error) : Promise.resolve(value)
  );
};

vi.mock('@/services/settings.service', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsServiceModule>();
  return {
    ...actual,
    settingsService: {
      ...actual.settingsService,
      getSpamRules: () => Promise.resolve(next.spam as SettingsServiceModule.SpamRule[]),
      updateSpamRule: (...args: Parameters<typeof actual.settingsService.updateSpamRule>) =>
        attempt(args[1] as unknown as Awaited<ReturnType<typeof actual.settingsService.updateSpamRule>>),
      createSpamRule: (...args: Parameters<typeof actual.settingsService.createSpamRule>) =>
        attempt(args[0] as unknown as Awaited<ReturnType<typeof actual.settingsService.createSpamRule>>),
      getKnowledgeDetectionRules: () => Promise.resolve([]),
      createKnowledgeDetectionRule: (
        ...args: Parameters<typeof actual.settingsService.createKnowledgeDetectionRule>
      ) =>
        attempt(
          args[0] as unknown as Awaited<
            ReturnType<typeof actual.settingsService.createKnowledgeDetectionRule>
          >
        ),
      getCategories: () => Promise.resolve(next.categories as SettingsServiceModule.Category[]),
      updateCategory: (...args: Parameters<typeof actual.settingsService.updateCategory>) =>
        attempt(args[1] as unknown as Awaited<ReturnType<typeof actual.settingsService.updateCategory>>),
      createCategory: (...args: Parameters<typeof actual.settingsService.createCategory>) =>
        attempt(args[0] as unknown as Awaited<ReturnType<typeof actual.settingsService.createCategory>>),
    },
  };
});
vi.mock('@/features/settings/services/detectionRule.service', async (importOriginal) => {
  const actual = await importOriginal<typeof DetectionServiceModule>();
  return {
    ...actual,
    detectionRuleService: {
      ...actual.detectionRuleService,
      getAll: () => Promise.resolve({ success: true, data: [] }),
      create: (...args: Parameters<typeof actual.detectionRuleService.create>) =>
        attempt({ success: true, data: args[0] as unknown as DetectionServiceModule.DetectionRule }),
    },
  };
});
vi.mock('@/features/settings/services/priorityRule.service', async (importOriginal) => {
  const actual = await importOriginal<typeof PriorityServiceModule>();
  return {
    ...actual,
    priorityRuleService: {
      ...actual.priorityRuleService,
      list: () => Promise.resolve([]),
      create: (...args: Parameters<typeof actual.priorityRuleService.create>) =>
        attempt({ success: true, data: args[0] as unknown as PriorityServiceModule.PriorityRule }),
    },
  };
});

vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock('../FeatureSuggestions', () => ({ FeatureSuggestions: () => null }));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { SpamRulesSettings } from '@/features/settings/components/SpamRulesSettings';
import { DetectionRulesSettings } from '@/features/settings/components/DetectionRulesSettings';
import { KnowledgeDetectionRulesSettings } from '@/features/settings/components/KnowledgeDetectionRulesSettings';
import { PriorityRulesSettings } from '@/features/settings/components/PriorityRulesSettings';
import { CategoriesSettings } from '@/features/settings/components/CategoriesSettings';

const DUPLICATE = 'A rule with this name already exists here';
// The shape the real api-client interceptor throws when the server sent a body: an Error carrying
// `status` and `data`, and NO `.response` (src/lib/api-client.ts).
const axiosError = (status: number, data: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { status, data });
// A request that never got an answer: no status, no body.
const networkError = () =>
  Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });

type Page = {
  label: string;
  page: () => React.ReactElement;
  addButton: RegExp;
  /** Fill the required fields; returns the name typed, to prove the form survives a refusal. */
  fill: () => string;
  /** Something that exists only while the editor is open. */
  editorOpen: () => HTMLElement | null;
};

const type = (placeholder: string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

const PAGES: Page[] = [
  {
    label: 'spam rules',
    page: () => <SpamRulesSettings />,
    addButton: /add rule/i,
    fill: () => {
      type('e.g., phishing_indicators', 'shop_notice');
      type('What this rule detects', 'Shop order notice');
      return 'shop_notice';
    },
    editorOpen: () => screen.queryByPlaceholderText('e.g., phishing_indicators'),
  },
  {
    label: 'detection rules',
    page: () => <DetectionRulesSettings />,
    addButton: /add rule/i,
    fill: () => {
      type('e.g., urgent_customer_issue', 'urgent_issue');
      type('What this rule detects', 'Urgent issue');
      return 'urgent_issue';
    },
    editorOpen: () => screen.queryByPlaceholderText('e.g., urgent_customer_issue'),
  },
  {
    label: 'knowledge detection rules',
    page: () => <KnowledgeDetectionRulesSettings />,
    addButton: /add rule/i,
    fill: () => {
      type('e.g., pricing_information', 'pricing_info');
      type('What this rule detects', 'Asks about price');
      type(
        'Provide an example of text this rule should detect (used for semantic matching)…',
        'How much does it cost?'
      );
      return 'pricing_info';
    },
    editorOpen: () => screen.queryByPlaceholderText('e.g., pricing_information'),
  },
  {
    label: 'priority rules',
    page: () => <PriorityRulesSettings />,
    addButton: /add rule/i,
    fill: () => {
      type('e.g., priority_critical', 'priority_critical');
      type('What belongs in this tier', 'Outage reports');
      type(
        'Several sentences that read like real messages in this tier — not a keyword list',
        'Everything is down. Nobody can log in.'
      );
      return 'priority_critical';
    },
    editorOpen: () => screen.queryByPlaceholderText('e.g., priority_critical'),
  },
  {
    label: 'categories',
    page: () => <CategoriesSettings />,
    addButton: /add category/i,
    fill: () => {
      type('e.g., Technical Support', 'Billing');
      return 'Billing';
    },
    editorOpen: () => screen.queryByPlaceholderText('e.g., Technical Support'),
  },
];

beforeEach(() => {
  next.error = null;
  next.saves = 0;
  next.gate = null;
  next.spam = [];
  next.categories = [];
});
afterEach(cleanup);

const openAndFill = async (page: Page) => {
  render(page.page());
  fireEvent.click(await screen.findByRole('button', { name: page.addButton }));
  return page.fill();
};
const GENERIC = (page: Page) =>
  page.label === 'categories'
    ? 'Could not save the category. Try again.'
    : 'Could not save the rule. Try again.';
const duplicateText = (page: Page) =>
  page.label === 'categories' ? 'A category with this name already exists here' : DUPLICATE;
const save = async () => {
  const button = screen.getByRole('button', { name: /^save$/i });
  fireEvent.click(button);
  await waitFor(() => expect(next.saves).toBeGreaterThan(0));
};

describe.each(PAGES)('$label: a refused save', (page) => {
  it('shows the server message for a 409 and keeps the editor open with the typed values', async () => {
    next.error = axiosError(409, { success: false, error: DUPLICATE, code: 'DUPLICATE_RULE' });
    const typed = await openAndFill(page);
    await save();
    expect(await screen.findByText(duplicateText(page))).toBeTruthy();
    expect(page.editorOpen()).not.toBeNull();
    expect(screen.getByDisplayValue(typed)).toBeTruthy();
  });

  it('shows the server message for a 400 validation refusal', async () => {
    next.error = axiosError(400, { success: false, error: 'Pattern is not a valid expression' });
    await openAndFill(page);
    await save();
    expect(await screen.findByText('Pattern is not a valid expression')).toBeTruthy();
  });

  it('shows only the generic line for a 500, never the server internals', async () => {
    next.error = axiosError(500, { success: false, error: 'SELECT * FROM rules failed at db.ts:41' });
    await openAndFill(page);
    await save();
    expect(await screen.findByText(GENERIC(page))).toBeTruthy();
    expect(screen.queryByText(/SELECT/)).toBeNull();
    expect(page.editorOpen()).not.toBeNull();
  });

  it('shows the generic line for a network failure with no response', async () => {
    next.error = networkError();
    await openAndFill(page);
    await save();
    expect(await screen.findByText(GENERIC(page))).toBeTruthy();
  });

  it('clears the message when the form is edited, and a successful resave closes the editor', async () => {
    next.error = axiosError(409, { success: false, error: DUPLICATE, code: 'DUPLICATE_RULE' });
    const typed = await openAndFill(page);
    await save();
    await screen.findByText(duplicateText(page));
    // Editing the form clears the stale message.
    fireEvent.change(screen.getByDisplayValue(typed), { target: { value: `${typed}_2` } });
    expect(screen.queryByText(duplicateText(page))).toBeNull();
    // Resubmit succeeds: the editor closes.
    next.error = null;
    const before = next.saves;
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(next.saves).toBe(before + 1));
    await waitFor(() => expect(page.editorOpen()).toBeNull());
  });

  it('clears the message when the editor is closed and reopened', async () => {
    next.error = axiosError(409, { success: false, error: DUPLICATE, code: 'DUPLICATE_RULE' });
    await openAndFill(page);
    await save();
    await screen.findByText(duplicateText(page));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(page.editorOpen()).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: page.addButton }));
    expect(screen.queryByText(duplicateText(page))).toBeNull();
  });

  it('two quick clicks on Save send one request, and Save is disabled while it is in flight', async () => {
    let release: () => void = () => undefined;
    next.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openAndFill(page);
    const button = screen.getByRole('button', { name: /^save$/i });
    // Both clicks land before React re-renders: only the in-flight guard can stop the second.
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(next.saves).toBe(1));
    // The design-system Button is never natively disabled; it is marked aria-disabled.
    expect(screen.getByRole('button', { name: /^save$/i }).getAttribute('aria-disabled')).toBe('true');
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(next.saves).toBe(1);
    await waitFor(() => expect(page.editorOpen()).toBeNull());
  });

  it('renders the message as plain text, never as markup', async () => {
    next.error = axiosError(400, { success: false, error: '<img src=x data-testid="injected">' });
    await openAndFill(page);
    await save();
    expect(await screen.findByText('<img src=x data-testid="injected">')).toBeTruthy();
    expect(screen.queryByTestId('injected')).toBeNull();
  });
});

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

type EditPage = {
  label: string;
  page: () => React.ReactElement;
  seed: () => void;
  /** The Edit buttons of the listed rows, in order. */
  editButtons: () => HTMLElement[];
  /** The edit form shows this row's own name. */
  nameShown: (name: string) => boolean;
  names: [string, string];
};
const EDIT_PAGES: EditPage[] = [
  {
    label: 'spam rules',
    page: () => <SpamRulesSettings />,
    seed: () => {
      next.spam = [SPAM_RULE(1, 'rule_a'), SPAM_RULE(2, 'rule_b')];
    },
    editButtons: () => screen.getAllByLabelText('Edit rule'),
    nameShown: (name) => screen.queryByDisplayValue(name) !== null,
    names: ['rule_a', 'rule_b'],
  },
  {
    label: 'categories',
    page: () => <CategoriesSettings />,
    seed: () => {
      next.categories = [CATEGORY(1, 'Alpha'), CATEGORY(2, 'Beta')];
    },
    editButtons: () => screen.getAllByRole('button', { name: /^edit$/i }),
    nameShown: (name) => screen.queryByDisplayValue(name) !== null,
    names: ['Alpha', 'Beta'],
  },
];

describe.each(EDIT_PAGES)('$label: the EDIT form', (edit) => {
  const openEdit = async (index: number) => {
    await waitFor(() => expect(edit.editButtons().length).toBeGreaterThan(index));
    fireEvent.click(edit.editButtons()[index]);
  };

  it('shows a refusal once, inside the edit form, with the values intact', async () => {
    edit.seed();
    next.error = axiosError(400, { success: false, error: 'Name is too long' });
    render(edit.page());
    await openEdit(0);
    await save();
    expect(await screen.findByText('Name is too long')).toBeTruthy();
    expect(screen.getAllByText('Name is too long')).toHaveLength(1);
    expect(edit.nameShown(edit.names[0])).toBe(true);
  });

  it('a refusal that arrives after Cancel and Edit of another row does not show on that row', async () => {
    edit.seed();
    let release: () => void = () => undefined;
    next.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    next.error = axiosError(409, { success: false, error: DUPLICATE, code: 'DUPLICATE_RULE' });
    render(edit.page());
    await openEdit(0);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(next.saves).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await openEdit(1);
    expect(edit.nameShown(edit.names[1])).toBe(true);
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByText(DUPLICATE)).toBeNull();
    expect(screen.queryByText('A category with this name already exists here')).toBeNull();
    expect(edit.nameShown(edit.names[1])).toBe(true);
  });
});
