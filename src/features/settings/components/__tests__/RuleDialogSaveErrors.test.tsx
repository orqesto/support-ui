/**
 * A refused save in a rule dialog shows the server's reason inside the dialog.
 *
 * The shared hook used to log the failure and rethrow, so an admin who hit a duplicate name (409)
 * or a validation refusal (400) saw nothing: the dialog just sat there. These tests drive the REAL
 * pages and dialogs; only the services are replaced, and the stand-ins are built from the real
 * service objects so their signatures cannot drift.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type * as SettingsServiceModule from '@/services/settings.service';
import type * as DetectionServiceModule from '@/features/settings/services/detectionRule.service';
import type * as PriorityServiceModule from '@/features/settings/services/priorityRule.service';

/** What the next create/update call does: reject with this, or resolve when null. */
const next = vi.hoisted(() => ({ error: null as unknown, saves: 0 }));
const attempt = <T,>(value: T): Promise<T> => {
  next.saves += 1;
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the stand-in rejects with whatever the test set
  return next.error ? Promise.reject(next.error) : Promise.resolve(value);
};

vi.mock('@/services/settings.service', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsServiceModule>();
  return {
    ...actual,
    settingsService: {
      ...actual.settingsService,
      getSpamRules: () => Promise.resolve([]),
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
      getCategories: () => Promise.resolve([]),
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
const axiosError = (status: number, data: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });

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
});
afterEach(cleanup);

const openAndFill = async (page: Page) => {
  render(page.page());
  fireEvent.click(await screen.findByRole('button', { name: page.addButton }));
  return page.fill();
};
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
    expect(await screen.findByText(DUPLICATE)).toBeTruthy();
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
    expect(await screen.findByText('Could not save the rule. Try again.')).toBeTruthy();
    expect(screen.queryByText(/SELECT/)).toBeNull();
    expect(page.editorOpen()).not.toBeNull();
  });

  it('shows the generic line for a network failure with no response', async () => {
    next.error = new Error('Network Error');
    await openAndFill(page);
    await save();
    expect(await screen.findByText('Could not save the rule. Try again.')).toBeTruthy();
  });

  it('clears the message when the form is edited, and a successful resave closes the editor', async () => {
    next.error = axiosError(409, { success: false, error: DUPLICATE, code: 'DUPLICATE_RULE' });
    const typed = await openAndFill(page);
    await save();
    await screen.findByText(DUPLICATE);
    // Editing the form clears the stale message.
    fireEvent.change(screen.getByDisplayValue(typed), { target: { value: `${typed}_2` } });
    expect(screen.queryByText(DUPLICATE)).toBeNull();
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
    await screen.findByText(DUPLICATE);
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(page.editorOpen()).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: page.addButton }));
    expect(screen.queryByText(DUPLICATE)).toBeNull();
  });

  it('renders the message as plain text, never as markup', async () => {
    next.error = axiosError(400, { success: false, error: '<img src=x data-testid="injected">' });
    await openAndFill(page);
    await save();
    expect(await screen.findByText('<img src=x data-testid="injected">')).toBeTruthy();
    expect(screen.queryByTestId('injected')).toBeNull();
  });
});
