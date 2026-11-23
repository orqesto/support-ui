/**
 * Keyword auto-reply rules (Settings → AI → Automatic replies): the notice for a workspace whose AI
 * is paused. Every rule reply is checked by AI before it is sent; while the backend refuses that
 * check as a standing state (GET /api/ai/providers `ruleChecks`), each reply is held for a person
 * and the rules still look switched on.
 *
 * The real hook and service over a fake apiClient, with the app's query defaults. Invented data.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  rules: [] as Record<string, unknown>[],
  /** GET /api/ai/providers: answers, never settles ('pending') or rejects ('error'). */
  ai: 'answers' as 'answers' | 'pending' | 'error',
  /** The backend's own `usable` answer; `undefined` = a backend that does not send it yet. */
  usable: undefined as boolean | null | undefined,
  /**
   * The backend's `ruleChecks` answer (the spend gate's standing answer for a reply check);
   * `undefined` = a backend that does not send it yet.
   */
  ruleChecks: undefined as { held?: unknown; reason?: unknown } | null | undefined,
  /** The deployment sells plans (GET /api/health/version `deployment.billingEnabled`). */
  billingEnabled: true,
  canManageIntegrations: true,
  canViewSubscription: true,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) => {
      if (url === '/api/health/version') {
        return Promise.resolve({
          data: { version: '1.0.0', deployment: { billingEnabled: api.billingEnabled } },
        });
      }
      if (url !== '/api/ai/providers') {
        return Promise.resolve({ data: { success: true, data: api.rules } });
      }
      if (api.ai === 'pending') return new Promise(() => undefined);
      if (api.ai === 'error') return Promise.reject(new Error('providers request failed'));
      return Promise.resolve({
        data: {
          success: true,
          data: {
            enabled: [{ provider: 'openai' }],
            available: [],
            platform: { active: false },
            ...(api.usable === undefined ? {} : { usable: api.usable }),
            ...(api.ruleChecks === undefined ? {} : { ruleChecks: api.ruleChecks }),
          },
        },
      });
    },
    patch: (url: string, body: Record<string, unknown>) => {
      const id = Number(url.split('/').pop());
      const current = api.rules.find((rule) => rule['id'] === id) ?? {};
      return Promise.resolve({ data: { success: true, data: { ...current, ...body, id } } });
    },
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) => {
      if (permission === 'manage_integrations') return api.canManageIntegrations;
      if (permission === 'view_subscription') return api.canViewSubscription;
      return true;
    },
  }),
}));

const { AutoReplyRulesSection, UNUSABLE_AI_PROVIDER_WARNING } = await import(
  '../AutoReplyRulesSection'
);
const { AI_PAUSED_FOR_RULES } = await import('../ruleCheckHeld');

const refundRule = {
  id: 1,
  name: 'Refunds',
  keywords: ['refund', 'money back'],
  replyText: 'Our refund policy: example.com/refunds',
  enabled: true,
};

beforeEach(() => {
  api.rules = [];
  api.ai = 'answers';
  api.usable = undefined;
  api.ruleChecks = undefined;
  api.billingEnabled = true;
  api.canManageIntegrations = true;
  api.canViewSubscription = true;
});
afterEach(cleanup);

const renderSection = (canManage = true, autoReplyEnabled = true) =>
  render(
    <QueryClientProvider
      // The app's defaults (src/lib/queryClient): the hook must ask again in spite of them.
      client={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })}
    >
      <MemoryRouter>
        <AutoReplyRulesSection
          canManage={canManage}
          autoReplyEnabled={autoReplyEnabled}
          onShowAlert={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('Keyword rules: AI is paused for the workspace, so every rule reply is held (`ruleChecks`)', () => {
  const held = () => screen.queryByRole('status', { name: 'Keyword rule replies are held' });
  const settled = async () => {
    await screen.findByText('Refunds');
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  const paused = (reason: string | null) => {
    api.rules = [refundRule];
    api.usable = true;
    api.ruleChecks = { held: true, reason };
  };
  const linkTo = (name: string) => screen.queryByRole('link', { name })?.getAttribute('href');

  it('the lead sentence is the same for every reason', () => {
    expect(AI_PAUSED_FOR_RULES).toBe(
      'AI is paused for this workspace, so keyword rule replies are not sent: each one is held for a person.'
    );
  });

  it.each([
    ['trial_ended', 'The trial has ended and no plan is chosen yet.'],
    ['plan_lapsed', 'The subscription is not active.'],
  ])('%s: says why, with a link to choose a plan', async (reason, why) => {
    paused(reason);
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(held()?.textContent).toContain(`${AI_PAUSED_FOR_RULES} ${why}`);
    expect(linkTo('Choose a plan')).toBe('/pricing');
    expect(screen.queryByRole('link', { name: 'Add your own AI key' })).toBeNull();
  });

  it.each([
    ['free_allowance_used', 'The free AI allowance is used up.'],
    ['not_in_plan', 'AI is not included in the plan.'],
  ])('%s: says why, with links to add an own AI key and to upgrade', async (reason, why) => {
    paused(reason);
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(held()?.textContent).toContain(`${AI_PAUSED_FOR_RULES} ${why}`);
    expect(linkTo('Add your own AI key')).toBe('/settings#integrations/ai-providers');
    expect(linkTo('Upgrade')).toBe('/pricing');
  });

  it('free_allowance_used, only one of the two doors open to the viewer: only that link', async () => {
    paused('free_allowance_used');
    api.canViewSubscription = false;
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(linkTo('Add your own AI key')).toBe('/settings#integrations/ai-providers');
    expect(screen.queryByRole('link', { name: 'Upgrade' })).toBeNull();
    cleanup();

    api.canViewSubscription = true;
    api.canManageIntegrations = false;
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(linkTo('Upgrade')).toBe('/pricing');
    expect(screen.queryByRole('link', { name: 'Add your own AI key' })).toBeNull();
  });

  it('budget_used where plans are sold: says why, with a link to the subscription', async () => {
    paused('budget_used');
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(held()?.textContent).toContain(
      `${AI_PAUSED_FOR_RULES} This period's AI allowance is used up: rule replies are sent again when the period resets or the allowance grows.`
    );
    // The link waits for the deployment's answer (GET /api/health/version).
    await waitFor(() => expect(linkTo('Buy more messages or upgrade')).toBe('/subscription'));
  });

  it('budget_used on a deployment without billing: no link, nothing to buy', async () => {
    paused('budget_used');
    api.billingEnabled = false;
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(within(held() as HTMLElement).queryByRole('link')).toBeNull();
    expect(held()?.textContent).not.toContain('Ask a workspace admin');
  });

  it.each([
    [
      'server_ceiling',
      "This server's AI limit for the month is reached: rule replies are sent again when it resets.",
    ],
    [
      'limit_reached',
      "This workspace's AI limit is reached: rule replies are sent again when it resets or is raised.",
    ],
  ])('%s: says why, and offers nothing to click', async (reason, why) => {
    paused(reason);
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(held()?.textContent).toBe(`${AI_PAUSED_FOR_RULES} ${why}`);
    expect(within(held() as HTMLElement).queryByRole('link')).toBeNull();
  });

  it.each([
    ['trial_ended', 'Ask a workspace admin to choose a plan.'],
    ['plan_lapsed', 'Ask a workspace admin to choose a plan.'],
    ['free_allowance_used', 'Ask a workspace admin to add an AI key or upgrade.'],
    ['not_in_plan', 'Ask a workspace admin to add an AI key or upgrade.'],
    ['budget_used', 'Ask a workspace admin to buy more messages or upgrade.'],
  ])('%s, a viewer who cannot act: told to ask an admin, with no link', async (reason, ask) => {
    paused(reason);
    api.canManageIntegrations = false;
    api.canViewSubscription = false;
    renderSection();
    await waitFor(() => expect(held()?.textContent).toContain(ask));
    expect(within(held() as HTMLElement).queryByRole('link')).toBeNull();
  });

  it('a reason this bundle does not know, or none: the lead sentence alone', async () => {
    paused('something_new');
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(held()?.textContent).toBe(AI_PAUSED_FOR_RULES);
    cleanup();

    paused(null);
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(held()?.textContent).toBe(AI_PAUSED_FOR_RULES);
  });

  it('CONTROL — not held: no notice', async () => {
    api.rules = [refundRule];
    api.usable = true;
    api.ruleChecks = { held: false, reason: null };
    renderSection();
    await settled();
    expect(held()).toBeNull();
  });

  it('nothing is claimed on an unknown: null, a backend without the field, a malformed answer', async () => {
    api.rules = [refundRule];
    api.usable = true;
    for (const answer of [null, undefined, { reason: 'budget_used' }, { held: 'yes' }]) {
      api.ruleChecks = answer;
      renderSection();
      await settled();
      expect(held()).toBeNull();
      cleanup();
    }
  });

  it('no notice while the providers answer is loading, or when the request failed', async () => {
    paused('budget_used');
    api.ai = 'pending';
    renderSection();
    await settled();
    expect(held()).toBeNull();
    cleanup();

    api.ai = 'error';
    renderSection();
    await settled();
    expect(held()).toBeNull();
  });

  it('no notice without a switched-on rule', async () => {
    paused('budget_used');
    api.rules = [{ ...refundRule, enabled: false }];
    renderSection();
    await settled();
    expect(held()).toBeNull();
  });

  it('no notice while automatic replies are off: nothing is checked or held then', async () => {
    paused('budget_used');
    renderSection(true, false);
    await settled();
    expect(screen.getByText(/Automatic email replies are off/)).toBeTruthy();
    expect(held()).toBeNull();
  });

  it('never two warnings: an AI that cannot be used wins, and says nothing about a pause', async () => {
    paused('budget_used');
    api.usable = false;
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(screen.getAllByRole('status', { name: 'Keyword rule replies are held' })).toHaveLength(
      1
    );
    expect(held()?.textContent).toContain(UNUSABLE_AI_PROVIDER_WARNING);
    expect(held()?.textContent).not.toContain(AI_PAUSED_FOR_RULES);
  });

  it('a backend without `usable` is never read as paused, whatever else it sends', async () => {
    api.rules = [refundRule];
    api.ruleChecks = { held: true, reason: 'budget_used' };
    renderSection();
    await settled();
    expect(held()).toBeNull();
  });

  it('switching the last rule off removes the notice', async () => {
    paused('limit_reached');
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    fireEvent.click(screen.getByRole('switch', { name: 'Turn off rule Refunds' }));
    await waitFor(() => expect(held()).toBeNull());
  });
});
