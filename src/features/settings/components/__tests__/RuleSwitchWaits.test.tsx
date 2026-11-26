/**
 * The list's on/off switch on each rule page takes its turn with the editor (one write of a rule
 * in flight at a time), and a list that could not reload is said, never edited from.
 *
 * The REAL pages, services and api-client run; only the list reads are stand-ins, and the
 * api-client answers 2xx with `net.body` after a gate the test controls. The Suggestions block is
 * a button that reports a decision, as the real block does after an accepted suggestion.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import type * as SettingsServiceModule from '@/services/settings.service';
import type * as DetectionServiceModule from '@/features/settings/services/detectionRule.service';
import type * as PriorityServiceModule from '@/features/settings/services/priorityRule.service';

const net = vi.hoisted(() => ({
  gate: null as Promise<void> | null,
  body: undefined as unknown,
  sent: [] as { url: string; body: Record<string, unknown> }[],
  rows: [] as unknown[],
  listFails: false,
  lists: 0,
  toasts: [] as string[],
}));
const listed = <T,>(): Promise<T[]> => {
  net.lists += 1;
  return net.listFails
    ? Promise.reject(new Error('Network Error'))
    : Promise.resolve(net.rows as T[]);
};

vi.mock('@/services/settings.service', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsServiceModule>();
  return {
    ...actual,
    settingsService: {
      ...actual.settingsService,
      getSpamRules: () => listed<SettingsServiceModule.SpamRule>(),
      getKnowledgeDetectionRules: () => listed<SettingsServiceModule.KnowledgeDetectionRule>(),
    },
  };
});
vi.mock('@/features/settings/services/detectionRule.service', async (importOriginal) => {
  const actual = await importOriginal<typeof DetectionServiceModule>();
  return {
    ...actual,
    detectionRuleService: {
      ...actual.detectionRuleService,
      getAll: async () => ({
        success: true,
        data: await listed<DetectionServiceModule.DetectionRule>(),
      }),
    },
  };
});
vi.mock('@/features/settings/services/priorityRule.service', async (importOriginal) => {
  const actual = await importOriginal<typeof PriorityServiceModule>();
  return {
    ...actual,
    priorityRuleService: {
      ...actual.priorityRuleService,
      list: () => listed<PriorityServiceModule.PriorityRule>(),
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
vi.mock('../FeatureSuggestions', () => ({
  FeatureSuggestions: ({ onDecided }: { onDecided?: (decision: string) => void }) => (
    <button type="button" onClick={() => onDecided?.('accepted')}>
      Accept the suggestion
    </button>
  ),
}));
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
import { apiClient } from '@/lib/api-client';

type Row = { id: number; name: string; active: boolean } & Record<string, unknown>;
const PAGES: { label: string; page: () => React.ReactElement; row: (id: number, name: string) => Row }[] =
  [
    {
      label: 'spam rules',
      page: () => <SpamRulesSettings />,
      row: (id, name) => ({
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
        createdAt: '',
        updatedAt: '',
      }),
    },
    {
      label: 'detection rules',
      page: () => <DetectionRulesSettings />,
      row: (id, name) => ({
        id,
        organizationId: 1,
        departmentId: null,
        name,
        description: `${name} description`,
        pattern: 'urgent',
        exampleText: null,
        category: 'issue',
        confidence: 20,
        active: true,
        createdAt: '',
        updatedAt: '',
      }),
    },
    {
      label: 'knowledge detection rules',
      page: () => <KnowledgeDetectionRulesSettings />,
      row: (id, name) => ({
        id,
        organizationId: 1,
        name,
        description: `${name} description`,
        category: 'pricing',
        pattern: null,
        exampleText: 'How much?',
        confidence: 30,
        active: true,
        createdAt: '',
        updatedAt: '',
      }),
    },
    {
      label: 'priority rules',
      page: () => <PriorityRulesSettings />,
      row: (id, name) => ({
        id,
        priority: 'critical',
        name,
        description: `${name} description`,
        exampleText: 'Everything is down.',
        active: true,
      }),
    },
  ];

beforeEach(() => {
  net.gate = null;
  net.body = undefined;
  net.sent = [];
  net.rows = [];
  net.listFails = false;
  net.lists = 0;
  net.toasts = [];
  const answer = (url: unknown, body: unknown) => {
    net.sent.push({ url: String(url), body: body as Record<string, unknown> });
    return (net.gate ?? Promise.resolve()).then(() => ({ data: net.body, status: 200 }));
  };
  vi.spyOn(apiClient, 'put').mockImplementation(answer as never);
  vi.spyOn(apiClient, 'patch').mockImplementation(answer as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
/** The first two rows' switches, in list order (the table renders before the cards). */
const switches = () => screen.getAllByRole('button', { name: /^(active|inactive)/i });
const editButtons = () => screen.getAllByLabelText('Edit rule');
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

describe.each(PAGES)('$label: the on/off switch takes its turn', (page) => {
  const start = async () => {
    net.rows = [page.row(1, 'rule_one'), page.row(2, 'rule_two')];
    render(page.page());
    await waitFor(() => expect(editButtons().length).toBeGreaterThan(1));
  };

  it("while a rule's switch is in flight it says Saving…, sends nothing more, and its editor waits", async () => {
    await start();
    const release = hold();
    net.body = { success: true, data: { ...page.row(1, 'rule_one'), active: false } };
    fireEvent.click(switches()[0]);
    await waitFor(() => expect(net.sent).toHaveLength(1));
    expect(isDisabled(switches()[0])).toBe(true);
    expect(switches()[0].textContent).toContain('Saving…');
    fireEvent.click(switches()[0]);
    await settle();
    expect(net.sent).toHaveLength(1);
    // Another rule's switch is not held.
    expect(isDisabled(switches()[1])).toBe(false);
    fireEvent.click(editButtons()[0]);
    expect(screen.getByText(/Saving your earlier change to this rule/)).toBeTruthy();
    expect(isDisabled(screen.getByRole('button', { name: /^save$/i }))).toBe(true);
    net.rows = [{ ...page.row(1, 'rule_one'), active: false }, page.row(2, 'rule_two')];
    release();
    await settle();
    expect(screen.queryByText(/Saving your earlier change/)).toBeNull();
    expect(isDisabled(screen.getByRole('button', { name: /^save$/i }))).toBe(false);
  });

  it('a switch landing in an editor the person typed in: on/off takes the switched value, their text stays', async () => {
    await start();
    const release = hold();
    net.body = { success: true, data: { ...page.row(1, 'rule_one'), active: false } };
    fireEvent.click(switches()[0]);
    await waitFor(() => expect(net.sent).toHaveLength(1));
    fireEvent.click(editButtons()[0]);
    fireEvent.change(screen.getByDisplayValue('rule_one'), { target: { value: 'typed_name' } });
    net.rows = [{ ...page.row(1, 'rule_one'), active: false }, page.row(2, 'rule_two')];
    release();
    await settle();
    expect(screen.getByDisplayValue('typed_name')).toBeTruthy();
    expect(screen.getByText(/Fields you edited here keep your text/)).toBeTruthy();
    net.body = { success: true, data: { ...page.row(1, 'typed_name'), active: false } };
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(net.sent).toHaveLength(2));
    // The person's Save keeps the rule switched off and carries their text.
    expect(net.sent[1].body).toMatchObject({ name: 'typed_name', active: false });
  });
});

describe.each([PAGES[0], PAGES[1]])('$label: a reload after an accepted suggestion', (page) => {
  const start = async () => {
    net.rows = [page.row(1, 'rule_one'), page.row(2, 'rule_two')];
    render(page.page());
    await waitFor(() => expect(editButtons().length).toBeGreaterThan(1));
  };
  const accept = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Accept the suggestion' }));
    await settle();
  };
  const RELOAD_FAILED =
    'Could not reload the rules, so the list may be out of date. Editing reloads it first.';

  it('that fails is said, and Edit reloads first and opens the rewritten rule', async () => {
    await start();
    net.listFails = true;
    // The accepted suggestion rewrote rule one on the server.
    net.rows = [page.row(1, 'rewritten'), page.row(2, 'rule_two')];
    await accept();
    expect(net.toasts).toEqual([RELOAD_FAILED]);
    expect(screen.getAllByText('rule_one').length).toBeGreaterThan(0);
    fireEvent.click(editButtons()[0]);
    await settle();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    net.listFails = false;
    fireEvent.click(editButtons()[0]);
    await settle();
    expect(screen.getByDisplayValue('rewritten')).toBeTruthy();
    expect(screen.queryByDisplayValue('rule_one')).toBeNull();
  });

  it('that succeeds after a failed one makes the list current again: Edit opens without a reload', async () => {
    await start();
    net.listFails = true;
    await accept();
    net.listFails = false;
    await accept();
    const lists = net.lists;
    fireEvent.click(editButtons()[0]);
    await settle();
    expect(net.lists).toBe(lists);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
  });
});

describe('the first load failing', () => {
  it('says the rules could not be loaded, not that a list is out of date', async () => {
    net.listFails = true;
    render(<SpamRulesSettings />);
    await settle();
    expect(net.toasts).toEqual(['Could not load the rules. Reload the page to try again.']);
  });
});
