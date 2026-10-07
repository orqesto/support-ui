/**
 * Settings › Spam rules — "Match on" and "Category" are two different questions.
 *
 * The editor used to offer Sender / Subject / Content as the CATEGORY. The backend stored that as
 * the category and matched every such rule against the message text, so an admin's "Subject" rule
 * never looked at the subject, and no rule an admin wrote could say "this is an order notice".
 * These tests drive the real editor and assert what the save SENDS.
 */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import type { SpamRule } from '@/services/settings.service';

const service = vi.hoisted(() => ({
  rules: [] as unknown[],
  created: [] as unknown[],
  updated: [] as unknown[],
}));

vi.mock('@/services/settings.service', () => ({
  settingsService: {
    getSpamRules: () => Promise.resolve(service.rules),
    createSpamRule: (data: unknown) => {
      service.created.push(data);
      return Promise.resolve(data);
    },
    updateSpamRule: (id: number, data: unknown) => {
      service.updated.push({ id, ...(data as object) });
      return Promise.resolve(data);
    },
    deleteSpamRule: () => Promise.resolve(undefined),
  },
}));

vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
  useDepartmentById: () => undefined,
}));

// A plain stand-in for the searchable select, so a test can read its options and pick one.
vi.mock('@/components/ui/ReactSelect', () => ({
  ReactSelect: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

import { SpamRulesSettings } from '@/components/settings/SpamRulesSettings';

const RULE: SpamRule = {
  id: 7,
  organizationId: 1,
  name: 'shop_notice',
  description: 'Shop order notice',
  pattern: 'Bestellung erhalten',
  exampleText: null,
  category: 'transactional',
  matchField: 'subject',
  severity: 10,
  active: true,
  departmentId: null,
  createdAt: '2026-10-07T00:00:00Z',
  updatedAt: '2026-10-07T00:00:00Z',
};

const select = (label: string) => screen.getByLabelText<HTMLSelectElement>(label);
const optionValues = (label: string) => Array.from(select(label).options).map((option) => option.value);

const openCreate = async () => {
  render(<SpamRulesSettings />);
  fireEvent.click(await screen.findByRole('button', { name: /add rule/i }));
};

const openEdit = async (rule: SpamRule) => {
  service.rules = [rule];
  render(<SpamRulesSettings />);
  const [edit] = await screen.findAllByLabelText('Edit rule');
  fireEvent.click(edit);
};

const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
  await waitFor(() => expect(service.created.length + service.updated.length).toBeGreaterThan(0));
};

describe('spam rule editor — Match on vs Category', () => {
  beforeEach(() => {
    service.rules = [];
    service.created = [];
    service.updated = [];
  });
  afterEach(cleanup);

  it('the Category list holds meanings, not the three fields', async () => {
    await openCreate();
    expect(optionValues('Match on')).toEqual(['sender', 'subject', 'content']);
    const categories = optionValues('Category');
    expect(categories).toContain('transactional');
    for (const field of ['sender', 'subject', 'content']) expect(categories).not.toContain(field);
  });

  it('a new order-notice rule sends matchField subject AND category transactional', async () => {
    await openCreate();
    fireEvent.change(screen.getByPlaceholderText('e.g., phishing_indicators'), { target: { value: 'shop_notice' } });
    fireEvent.change(screen.getByPlaceholderText('What this rule detects'), { target: { value: 'Shop order notice' } });
    fireEvent.change(select('Match on'), { target: { value: 'subject' } });
    fireEvent.change(select('Category'), { target: { value: 'transactional' } });
    await save();
    expect(service.created[0]).toMatchObject({ matchField: 'subject', category: 'transactional' });
  });

  it('the notice hint and the "not used" severity show only for a notice rule on sender/subject', async () => {
    await openCreate();
    fireEvent.change(screen.getByPlaceholderText('verify your account|confirm identity|suspended'), {
      target: { value: 'Bestellung erhalten' },
    });
    fireEvent.change(select('Category'), { target: { value: 'transactional' } });
    // CONTROL — on the message text it is not a notice rule.
    expect(screen.queryByTestId('spam-rule-notice-hint')).toBeNull();
    expect(screen.queryByText(/not used for a notice rule/)).toBeNull();

    fireEvent.change(select('Match on'), { target: { value: 'sender' } });
    expect(screen.getByTestId('spam-rule-notice-hint')).toBeInTheDocument();
    expect(screen.getByText(/not used for a notice rule/)).toBeInTheDocument();
    expect(screen.queryByText(/Mark as Spam|Flag for Review|Auto-Reject/, { selector: 'span' })).toBeNull();
  });

  it('editing reads the rule’s field back and an untouched save keeps it', async () => {
    await openEdit({ ...RULE, matchField: 'sender' });
    expect(select('Match on').value).toBe('sender');
    await save();
    expect(service.updated[0]).toMatchObject({ id: 7, matchField: 'sender', category: 'transactional' });
  });

  it('an old save (field in the category, backend without matchField) opens on that field and keeps its category', async () => {
    await openEdit({ ...RULE, category: 'subject', matchField: undefined });
    expect(select('Match on').value).toBe('subject');
    // Kept selectable, so opening and saving the rule does not quietly change it.
    expect(select('Category').value).toBe('subject');
    await save();
    expect(service.updated[0]).toMatchObject({ matchField: 'subject', category: 'subject' });
  });

  it('no pattern ⇒ no notice hint (example text alone never files mail)', async () => {
    await openEdit({ ...RULE, pattern: '', exampleText: 'Sie haben eine Bestellung erhalten', provenance: 'admin_added' });
    expect(screen.queryByTestId('spam-rule-notice-hint')).toBeNull();
    // CONTROL — give it a pattern and it is a notice rule.
    fireEvent.change(screen.getByPlaceholderText('verify your account|confirm identity|suspended'), {
      target: { value: 'Bestellung erhalten' },
    });
    expect(screen.getByTestId('spam-rule-notice-hint')).toBeInTheDocument();
  });

  it('a BUILT-IN transactional sender rule is not called a notice rule — its severity still counts', async () => {
    await openEdit({ ...RULE, name: 'no_reply_address', matchField: 'sender', severity: 100, provenance: 'seed' });
    expect(screen.queryByTestId('spam-rule-notice-hint')).toBeNull();
    expect(screen.queryByText(/not used for a notice rule/)).toBeNull();
    expect(screen.getByText(/Auto-Reject/, { selector: 'span' })).toBeInTheDocument();
  });

  it('CONTROL — the same rule added by an admin IS a notice rule', async () => {
    await openEdit({ ...RULE, matchField: 'sender', provenance: 'admin_added' });
    expect(screen.getByTestId('spam-rule-notice-hint')).toBeInTheDocument();
  });

  it('the list uses the editor’s words and says what each rule matches on', async () => {
    service.rules = [RULE, { ...RULE, id: 8, name: 'old_save', category: 'subject', matchField: undefined }];
    render(<SpamRulesSettings />);
    expect((await screen.findAllByText('Order / system notice')).length).toBeGreaterThan(0);
    expect((await screen.findAllByTestId('spam-rule-match-on')).map((node) => node.textContent)).toEqual([
      'on subject',
      'on subject',
    ]);
  });

  it('protected security rules keep a capitalised name in the list', async () => {
    service.rules = [{ ...RULE, category: 'security', provenance: 'seed' }];
    render(<SpamRulesSettings />);
    expect(await screen.findByText('Security')).toBeInTheDocument();
  });

  it('a learned rule’s own category stays selectable', async () => {
    await openEdit({ ...RULE, category: 'marketing', matchField: 'content' });
    expect(optionValues('Category')).toContain('marketing');
    expect(within(select('Category')).getByText('marketing')).toBeInTheDocument();
  });
});
