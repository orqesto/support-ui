/**
 * BE R16 (be-toklim-wt 44f0f921, managedAIUsageController `limitsTotals`):
 * `totals.tokenBudgets.settingsLookupFailed` — the stored limits could not be read, so `kb` /
 * `regular` / `ownKeyEnforced`, the overrides and every workspace's limits are the env/built-in
 * FALLBACK. The console must say so, never show them as the saved limits.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ManagedAiUsage, OrgTokenBudget } from '@/services/managedAiUsage.service';

vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: { getForecast: () => new Promise(() => {}) },
}));

const { TokenLimitsCard } = await import('../TokenLimitsCard');
const { WorkspaceLimitCell, WorkspaceTokenLimitsDialog } = await import('../WorkspaceTokenLimits');

afterEach(cleanup);

type Budgets = NonNullable<ManagedAiUsage['totals']['tokenBudgets']>;
// The fallback the BE answers on a failed read: env/default sources, no overrides.
const failed: Budgets = {
  kb: { limit: 5_000_000, source: 'default' },
  regular: { limit: 2_000_000, source: 'env' },
  ownKeyEnforced: false,
  settingsLookupFailed: true,
  workspaceOverrides: {},
};
const readable: Budgets = { ...failed, settingsLookupFailed: false };
const orgBudget: OrgTokenBudget = {
  kb: { limit: 5_000_000, source: 'default', spentToday: 1_000 },
  regular: { limit: 2_000_000, source: 'env', spentToday: 2_000 },
  override: null,
  enforced: false,
};
// What the BE really sends for a workspace while the settings are unreadable: the gate answers
// `{enforced:false, lookupFailed:true}` (managedSpendGate reportTokenBudgetEnforcement) — pass 17
// tests NIT-6. The same workspace once readable: its real KB override.
const failedOrgBudget: OrgTokenBudget = { ...orgBudget, enforcementLookupFailed: true };
const readableOrgBudget: OrgTokenBudget = {
  ...orgBudget,
  kb: { limit: 9_000_000, source: 'workspace', spentToday: 1_000 },
  override: { kbTokensPerDay: 9_000_000 },
};

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>
  );
const text = () => document.body.textContent ?? '';

describe('stored limit settings unreadable (settingsLookupFailed)', () => {
  it('the platform card says the figures are fallbacks and the own-key rule is unknown', () => {
    wrap(<TokenLimitsCard budgets={failed} />);
    expect(screen.getByTestId('token-limits-unreadable').textContent).toBe(
      'The stored limit settings could not be read. A figure marked “fallback” is the server environment setting or the built-in default, not a saved limit. Workspaces listed only for their own limits may be missing from the table, and the limits cannot be edited until the settings can be read.'
    );
    expect(text()).toContain('KB processing 5,000,000 · built-in default — fallback');
    expect(text()).toContain(
      'Whether own-key workspaces are stopped at their limits is unknown: the stored setting could not be read.'
    );
    expect(text()).not.toContain('measured and notified only');
  });

  it('CONTROL: a readable row shows the limits as set, with no fallback note', () => {
    wrap(<TokenLimitsCard budgets={readable} />);
    expect(screen.queryByTestId('token-limits-unreadable')).toBeNull();
    expect(text()).not.toContain('fallback');
    expect(text()).toContain('measured and notified only');
    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeDisabled();
  });

  // FE audit pass 17 (queued + console LOW-1): editing on the fallback saved it as a change.
  it('cannot be edited while unreadable', () => {
    wrap(<TokenLimitsCard budgets={failed} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  it('a form open when the settings turn unreadable cannot Save, and says why', () => {
    const client = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <TokenLimitsCard budgets={readable} />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    rerender(
      <QueryClientProvider client={client}>
        <TokenLimitsCard budgets={failed} />
      </QueryClientProvider>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByTestId('token-limits-unreadable')).toBeTruthy();
    // The note says the limits cannot be edited: the open form's fields lock too, and its
    // placeholders mark the fallback figures (FE audit pass 18, NIT). Cancel stays usable.
    const kbField = screen.getByLabelText<HTMLInputElement>('KB processing (tokens per UTC day)');
    expect(kbField).toBeDisabled();
    expect(screen.getByLabelText('Regular work (tokens per UTC day)')).toBeDisabled();
    expect(kbField.placeholder).toBe(
      '5,000,000 · built-in default — fallback — leave blank to keep'
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
  });

  // Pass 17 NIT-1: the BE's soft re-read can return the STORED platform setting with the flag.
  it('a platform-set figure beside the flag is not called a fallback', () => {
    wrap(<TokenLimitsCard budgets={{ ...failed, kb: { limit: 7_000_000, source: 'platform' } }} />);
    expect(text()).toContain('KB processing 7,000,000 · platform setting');
    expect(text()).not.toContain('7,000,000 · platform setting — fallback');
    expect(text()).toContain('2,000,000 · server environment setting — fallback');
  });

  it('CONTROL: settings read fine (settingsLookupFailed false) reads as readable', () => {
    wrap(<TokenLimitsCard budgets={{ ...failed, settingsLookupFailed: false }} />);
    expect(screen.queryByTestId('token-limits-unreadable')).toBeNull();
  });

  it('a workspace cell names the fallback, never "platform limits" or "measured only"', () => {
    render(<WorkspaceLimitCell budget={orgBudget} settingsUnreadable onOpen={() => {}} />);
    expect(text()).toContain('stored limits unreadable · fallback shown');
    expect(text()).not.toContain('platform limits');
    expect(text()).not.toContain('measured only');
  });

  it('CONTROL: the same cell with readable settings', () => {
    render(<WorkspaceLimitCell budget={orgBudget} onOpen={() => {}} />);
    expect(text()).toContain('platform limits · own key, measured only');
  });

  it('the workspace dialog says its fields and the marked figures are not the saved limits', () => {
    wrap(
      <WorkspaceTokenLimitsDialog
        organizationId={7}
        name="acme"
        budget={failedOrgBudget}
        budgets={failed}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('workspace-limits-unreadable').textContent).toBe(
      'The stored limit settings could not be read: the fields here and a figure marked “fallback” are not this workspace’s saved limits. They cannot be edited until the settings can be read.'
    );
    // Marked as the card marks them (FE audit pass 18, NIT).
    expect(
      screen.getByLabelText<HTMLInputElement>('KB processing (tokens per UTC day)').placeholder
    ).toBe('Platform: 5,000,000 · built-in default — fallback');
    expect(text()).not.toContain('own-key limits are measured only');
    // One unreadable sentence, not the enforcement-unknown one beside it.
    expect(text()).not.toContain('disagree with the answer in use');
    expect(screen.getByLabelText('KB processing (tokens per UTC day)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('once readable again the fields are filled from the REAL override, not the blank fallback', () => {
    const client = new QueryClient();
    const dialog = (budget: OrgTokenBudget, budgets: Budgets) => (
      <QueryClientProvider client={client}>
        <WorkspaceTokenLimitsDialog
          organizationId={7}
          name="acme"
          budget={budget}
          budgets={budgets}
          onClose={() => {}}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(dialog(failedOrgBudget, failed));
    const kbField = () =>
      screen.getByLabelText<HTMLInputElement>('KB processing (tokens per UTC day)');
    expect(kbField().value).toBe('');
    rerender(dialog(readableOrgBudget, readable));
    expect(kbField().value).toBe('9000000');
    expect(kbField()).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  it('CONTROL: opened readable, a typed value is kept when the data refreshes', () => {
    const client = new QueryClient();
    const dialog = (budget: OrgTokenBudget) => (
      <QueryClientProvider client={client}>
        <WorkspaceTokenLimitsDialog
          organizationId={7}
          name="acme"
          budget={budget}
          budgets={readable}
          onClose={() => {}}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(dialog(orgBudget));
    fireEvent.change(screen.getByLabelText('KB processing (tokens per UTC day)'), {
      target: { value: '123' },
    });
    rerender(dialog(readableOrgBudget));
    expect(
      screen.getByLabelText<HTMLInputElement>('KB processing (tokens per UTC day)').value
    ).toBe('123');
  });

  it('a platform-set figure beside the flag is not marked a fallback in the dialog either', () => {
    wrap(
      <WorkspaceTokenLimitsDialog
        organizationId={7}
        name="acme"
        budget={failedOrgBudget}
        budgets={{ ...failed, kb: { limit: 7_000_000, source: 'platform' } }}
        onClose={() => {}}
      />
    );
    expect(
      screen.getByLabelText<HTMLInputElement>('KB processing (tokens per UTC day)').placeholder
    ).toBe('Platform: 7,000,000 · platform setting');
    expect(
      screen.getByLabelText<HTMLInputElement>('Regular work (tokens per UTC day)').placeholder
    ).toBe('Platform: 2,000,000 · server environment setting — fallback');
  });

  // FE audit pass 18, LOW: opened readable, typed, then unreadable and readable again — the typing
  // stayed; it was wiped by a refill and Save then sent nothing while saying "saved".
  it('opened readable: a value typed before the settings turned unreadable survives their return', () => {
    const client = new QueryClient();
    const dialog = (budget: OrgTokenBudget, budgets: Budgets) => (
      <QueryClientProvider client={client}>
        <WorkspaceTokenLimitsDialog
          organizationId={7}
          name="acme"
          budget={budget}
          budgets={budgets}
          onClose={() => {}}
        />
      </QueryClientProvider>
    );
    const kbField = () =>
      screen.getByLabelText<HTMLInputElement>('KB processing (tokens per UTC day)');
    const { rerender } = render(dialog(readableOrgBudget, readable));
    fireEvent.change(kbField(), { target: { value: '5000000' } });
    rerender(dialog(failedOrgBudget, failed));
    expect(kbField()).toBeDisabled();
    expect(kbField().value).toBe('5000000');
    rerender(dialog(readableOrgBudget, readable));
    expect(kbField().value).toBe('5000000');
    expect(kbField()).not.toBeDisabled();
  });

  // FE audit pass 19, LOW: opened readable, then a refetch turned unreadable — the fields still
  // hold the REAL saved figures, and the note must not call them "not this workspace’s saved
  // limits". Opened unreadable it still does (the CONTROL is the test above).
  it('opened readable, then unreadable: the note says the fields kept what they held', () => {
    const client = new QueryClient();
    const dialog = (budget: OrgTokenBudget, budgets: Budgets) => (
      <QueryClientProvider client={client}>
        <WorkspaceTokenLimitsDialog
          organizationId={7}
          name="acme"
          budget={budget}
          budgets={budgets}
          onClose={() => {}}
        />
      </QueryClientProvider>
    );
    const kbField = () =>
      screen.getByLabelText<HTMLInputElement>('KB processing (tokens per UTC day)');
    const KEPT =
      'The stored limit settings can no longer be read: the fields keep what they held before, and a figure marked “fallback” is not a saved limit. They cannot be edited until the settings can be read.';
    const { rerender } = render(dialog(readableOrgBudget, readable));
    rerender(dialog(failedOrgBudget, failed));
    expect(kbField().value).toBe('9000000');
    expect(screen.getByTestId('workspace-limits-unreadable').textContent).toBe(KEPT);
    // Opened unreadable, refilled once readable, then unreadable again: the real seeds — kept.
    cleanup();
    const second = render(dialog(failedOrgBudget, failed));
    expect(screen.getByTestId('workspace-limits-unreadable').textContent).not.toBe(KEPT);
    second.rerender(dialog(readableOrgBudget, readable));
    second.rerender(dialog(failedOrgBudget, failed));
    expect(kbField().value).toBe('9000000');
    expect(screen.getByTestId('workspace-limits-unreadable').textContent).toBe(KEPT);
  });

  it('CONTROL: settings read fine (flag false) — no unreadable note, the own-key sentence, editable', () => {
    wrap(
      <WorkspaceTokenLimitsDialog
        organizationId={7}
        name="acme"
        budget={orgBudget}
        budgets={{ ...failed, settingsLookupFailed: false }}
        onClose={() => {}}
      />
    );
    expect(screen.queryByTestId('workspace-limits-unreadable')).toBeNull();
    expect(text()).toContain('own-key limits are measured only');
    expect(screen.getByLabelText('KB processing (tokens per UTC day)')).not.toBeDisabled();
  });
});
