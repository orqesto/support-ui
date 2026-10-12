/**
 * Tester feedback 2026-10-12: in the workspace dialog a grey "Platform: …" placeholder read like a
 * value typed in. Each field now says whether it holds this workspace's OWN limit or inherits the
 * platform's, and one click returns an own limit to the platform's (Save then sends null).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OrgTokenBudget } from '@/services/managedAiUsage.service';

type Edit = { kbTokensPerDay?: number | null; regularTokensPerDay?: number | null };
let sent: Edit[] = [];
vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: {
    updateWorkspaceLimits: (_org: number, edit: Edit) => {
      sent.push(edit);
      return Promise.resolve({ release: null, regularRelease: null });
    },
    // The forecast is not what these tests are about: it never answers.
    getForecast: () => new Promise(() => {}),
  },
}));
vi.mock('sonner', () => ({ toast: { success: () => {}, warning: () => {}, error: () => {} } }));

const { WorkspaceTokenLimitsDialog } = await import('../WorkspaceTokenLimits');

const budget: OrgTokenBudget = {
  kb: { limit: 6_000_000, source: 'workspace', spentToday: 0 },
  regular: { limit: 2_000_000, source: 'default', spentToday: 0 },
  override: { kbTokensPerDay: 6_000_000 },
  enforced: true,
};
const budgets = {
  kb: { limit: 5_000_000, source: 'default' as const },
  regular: { limit: 2_000_000, source: 'default' as const },
  ownKeyEnforced: false,
  workspaceOverrides: {},
};

const renderDialog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
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
};
const kbField = () => screen.getByLabelText('KB processing (tokens per UTC day)');
const regularField = () => screen.getByLabelText('Regular work (tokens per UTC day)');
const state = (bucket: 'kb' | 'regular') =>
  screen.getByTestId(`workspace-limit-${bucket}-state`).textContent;

beforeEach(() => {
  sent = [];
});
afterEach(cleanup);

describe('workspace limits: own or inherited', () => {
  it('says which field is the workspace OWN limit and which is inherited', () => {
    renderDialog();
    expect(state('kb')).toBe('Own limit for this workspace.Use the platform KB limit');
    expect(state('regular')).toBe('Inherited from the platform: 2,000,000 · built-in default.');
    expect(regularField()).toHaveAttribute('placeholder', 'Inherits 2,000,000 · built-in default');
  });

  it('"Use the platform KB limit" empties the field, says what follows, and Save sends null', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Use the platform KB limit' }));
    expect(kbField()).toHaveValue('');
    expect(state('kb')).toBe(
      'Follows the platform limit after Save: 5,000,000 · built-in default.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ kbTokensPerDay: null });
  });

  it('CONTROL: a value typed into an inherited field reads as the workspace own limit', () => {
    renderDialog();
    fireEvent.change(regularField(), { target: { value: '3000000' } });
    expect(state('regular')).toContain('Own limit for this workspace.');
  });
});
