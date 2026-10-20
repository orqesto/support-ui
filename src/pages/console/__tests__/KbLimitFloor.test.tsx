/**
 * Owner decision D-R21-1: the daily KB limit is at least 1,000,000 tokens (the backend answers 400
 * below it). Both editors — the platform card and the workspace dialog — refuse a smaller value
 * before Save, keep 0 (no limit) allowed, never lock the form over a value saved before the floor
 * existed (it is not re-sent), and show the backend's own 400 message if one comes back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OrgTokenBudget } from '@/services/managedAiUsage.service';

type Edit = Record<string, unknown>;
let platformSent: Edit[] = [];
let workspaceSent: Edit[] = [];
/** Plain functions: vitest 4 fails a test on a module-level vi.fn's caught rejection. */
let answer: () => Promise<unknown> = () => Promise.resolve({ release: null, regularRelease: null });
let errors: string[] = [];
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: {
    updatePlatformLimits: (edit: Edit) => {
      platformSent.push(edit);
      return answer();
    },
    updateWorkspaceLimits: (_organizationId: number, edit: Edit) => {
      workspaceSent.push(edit);
      return answer();
    },
    getForecast: () => new Promise(() => undefined),
  },
}));
vi.mock('sonner', () => ({
  toast: {
    success: () => undefined,
    warning: () => undefined,
    error: (message: string) => errors.push(message),
  },
}));

const { TokenLimitsCard } = await import('../TokenLimitsCard');
const { WorkspaceTokenLimitsDialog } = await import('../WorkspaceTokenLimits');
const { KB_FLOOR_ERROR } = await import('../tokenLimits.helpers');

type Budgets = Parameters<typeof TokenLimitsCard>[0]['budgets'];
const budgets = (over: Partial<Budgets> = {}): Budgets => ({
  kb: { limit: 7_000_000, source: 'platform' },
  regular: { limit: 2_000_000, source: 'default' },
  ownKeyEnforced: false,
  workspaceOverrides: {},
  ...over,
});
const budget = (over: Partial<OrgTokenBudget> = {}): OrgTokenBudget => ({
  kb: { limit: 7_000_000, source: 'platform', spentToday: 0 },
  regular: { limit: 2_000_000, source: 'default', spentToday: 0 },
  override: null,
  enforced: true,
  ...over,
});

const wrap = (node: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
};
const renderCard = (value: Budgets = budgets()) => {
  render(wrap(<TokenLimitsCard budgets={value} />));
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
};
const renderDialog = (value: OrgTokenBudget = budget()) =>
  render(
    wrap(
      <WorkspaceTokenLimitsDialog
        organizationId={7}
        name="acme"
        budget={value}
        budgets={budgets()}
        onClose={() => undefined}
      />
    )
  );
const kbField = () => screen.getByLabelText('KB processing (tokens per UTC day)');
const regularField = () => screen.getByLabelText('Regular work (tokens per UTC day)');
const saveButton = () => screen.getByRole('button', { name: 'Save' });
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });
const save = async () => {
  fireEvent.click(saveButton());
  await act(async () => {});
};

// The backend's refusal as the api-client interceptor hands it on: status + body on the error —
// the exact body of be-toklim-wt 121ce4d3 (tokenBudget.ts KB_FLOOR message, VALIDATION_FAILED).
const BE_FLOOR_MESSAGE =
  'The KB processing daily limit must be at least 1,000,000 tokens, or 0 for no limit.';
const refusal = (message: string) =>
  Object.assign(new Error(message), {
    status: 400,
    data: { success: false, error: message, code: 'VALIDATION_FAILED' },
  });

beforeEach(() => {
  platformSent = [];
  workspaceSent = [];
  errors = [];
  answer = () => Promise.resolve({ release: null, regularRelease: null });
});
afterEach(cleanup);

describe.each([
  ['the platform card', renderCard, () => platformSent],
  ['the workspace dialog', () => renderDialog(), () => workspaceSent],
])('%s — the KB floor', (_where, open, sent) => {
  it('one below the floor is refused before Save, saying the minimum', async () => {
    open();
    type(kbField(), '999,999');
    expect(screen.getByText(KB_FLOOR_ERROR)).toBeTruthy();
    expect(saveButton()).toBeDisabled();
    await save();
    expect(sent()).toEqual([]);
  });

  it('exactly the floor is accepted and sent', async () => {
    open();
    type(kbField(), '1,000,000');
    expect(screen.queryByText(KB_FLOOR_ERROR)).toBeNull();
    await save();
    expect(sent()).toEqual([expect.objectContaining({ kbTokensPerDay: 1_000_000 })]);
  });

  it('0 (no limit) is not a tiny limit: accepted', async () => {
    open();
    type(kbField(), '0');
    expect(screen.queryByText(KB_FLOOR_ERROR)).toBeNull();
    await save();
    expect(sent()).toEqual([expect.objectContaining({ kbTokensPerDay: 0 })]);
  });

  it("the backend's 400 message is shown", async () => {
    answer = () => Promise.reject(refusal(BE_FLOOR_MESSAGE));
    open();
    type(kbField(), '2,000,000');
    await save();
    expect(errors).toEqual([BE_FLOOR_MESSAGE]);
  });
});

/**
 * The card shows the limit IN FORCE, which the backend clamps to the floor (tokenBudget.ts), so it
 * never holds a sub-floor value. The dialog's override is the RAW stored value: one written outside
 * the console below the floor shows there as saved, with the limit in force beside it.
 */
describe('a workspace KB override written outside the console below the floor', () => {
  // The backend's row for it: the override raw, the limit in force clamped to the floor.
  const subFloor = () =>
    budget({
      kb: { limit: 1_000_000, source: 'workspace', spentToday: 0 },
      override: { kbTokensPerDay: 500_000 },
    });
  const note = () => screen.getByText(/^Blank follows the platform limit/).textContent ?? '';

  it('the dialog: not refused — a regular-only edit saves and leaves it alone', async () => {
    renderDialog(subFloor());
    expect(screen.queryByText(KB_FLOOR_ERROR)).toBeNull();
    type(regularField(), '3,000,000');
    await save();
    expect(workspaceSent).toEqual([{ regularTokensPerDay: 3_000_000 }]);
  });

  it('the dialog says what is saved and what is in force', () => {
    renderDialog(subFloor());
    expect(note()).toContain('Saved as 500,000; the limit in force is 1,000,000 (the minimum).');
  });

  it('CONTROL: an override at or above the floor, or 0, gets no such line', () => {
    renderDialog(budget({ override: { kbTokensPerDay: 1_000_000 } }));
    expect(note()).not.toContain('Saved as');
    cleanup();
    renderDialog(budget({ override: { kbTokensPerDay: 0 } }));
    expect(note()).not.toContain('Saved as');
  });

  it('CONTROL: another value below the floor typed over it is refused', () => {
    renderDialog(subFloor());
    type(kbField(), '600000');
    expect(screen.getByText(KB_FLOOR_ERROR)).toBeTruthy();
    expect(saveButton()).toBeDisabled();
  });
});
