/**
 * Keyword auto-reply rules (Settings → AI → Automatic replies): add, inline errors, toggle, delete, and
 * the read-only list for someone without MANAGE_AUTO_REPLY. Runs the real service over a fake
 * apiClient. Invented data.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AlertState } from '@/features/settings/components/integrations/types';

const api = vi.hoisted(() => ({
  rules: [] as Record<string, unknown>[],
  posts: [] as unknown[],
  patches: [] as { url: string; body: unknown }[],
  deletes: [] as string[],
  postError: null as Error | null,
  patchError: null as Error | null,
  /** GET /api/ai/providers: the answer, 'pending' (never settles) or 'error' (rejects). */
  ai: 'configured' as 'configured' | 'none' | 'pending' | 'error',
  /** The backend's own `usable` answer; `undefined` = a backend that does not send it yet. */
  usable: undefined as boolean | null | undefined,
  /** Platform AI is on for the workspace (no provider row of its own). */
  platformActive: false,
  /** How many times GET /api/ai/providers was asked. */
  providerReads: 0,
  canManageIntegrations: true,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) => {
      if (url !== '/api/ai/providers') {
        return Promise.resolve({ data: { success: true, data: api.rules } });
      }
      api.providerReads += 1;
      if (api.ai === 'pending') return new Promise(() => undefined);
      if (api.ai === 'error') return Promise.reject(new Error('providers request failed'));
      const enabled = api.ai === 'configured' ? [{ provider: 'openai' }] : [];
      return Promise.resolve({
        data: {
          success: true,
          data: {
            enabled,
            available: [],
            platform: { active: api.platformActive },
            ...(api.usable === undefined ? {} : { usable: api.usable }),
          },
        },
      });
    },
    post: (_url: string, body: Record<string, unknown>) => {
      api.posts.push(body);
      if (api.postError) return Promise.reject(api.postError);
      return Promise.resolve({
        data: { success: true, data: { id: 99, enabled: true, ...body } },
      });
    },
    patch: (url: string, body: Record<string, unknown>) => {
      api.patches.push({ url, body });
      if (api.patchError) return Promise.reject(api.patchError);
      const id = Number(url.split('/').pop());
      const current = api.rules.find((rule) => rule['id'] === id) ?? {};
      return Promise.resolve({ data: { success: true, data: { ...current, ...body, id } } });
    },
    delete: (url: string) => {
      api.deletes.push(url);
      return Promise.resolve({ data: { success: true } });
    },
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) =>
      permission !== 'manage_integrations' || api.canManageIntegrations,
  }),
}));

const {
  AutoReplyRulesSection,
  NO_AI_PROVIDER_WARNING,
  UNUSABLE_AI_PROVIDER_WARNING,
  RULE_CHECK_NOTE,
} = await import('../AutoReplyRulesSection');

const refundRule = {
  id: 1,
  name: 'Refunds',
  keywords: ['refund', 'money back'],
  replyText: 'Our refund policy: example.com/refunds',
  enabled: true,
};

beforeEach(() => {
  api.rules = [];
  api.posts = [];
  api.patches = [];
  api.deletes = [];
  api.postError = null;
  api.patchError = null;
  api.ai = 'configured';
  api.usable = undefined;
  api.platformActive = false;
  api.providerReads = 0;
  api.canManageIntegrations = true;
});
afterEach(cleanup);

const renderSection = (
  canManage = true,
  autoReplyEnabled = true,
  onShowAlert: (alert: AlertState) => void = () => undefined
) =>
  render(
    // The real useRuleCheckAi over the fake apiClient; a client per render unless one is passed.
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <AutoReplyRulesSection
          canManage={canManage}
          autoReplyEnabled={autoReplyEnabled}
          onShowAlert={onShowAlert}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

/** "Add rule" is disabled while the list loads: wait for the empty state first. */
const openNewRule = async () => {
  await screen.findByText(/No keyword rules yet/);
  fireEvent.click(screen.getByRole('button', { name: /add rule/i }));
};

const saveButton = () =>
  within(screen.getByTestId('auto-reply-rule-form')).getByRole('button', {
    name: /add rule|save rule/i,
  });

describe('AutoReplyRulesSection', () => {
  it('a rule without keyword and reply text is not saved; the inline errors say which', async () => {
    renderSection();
    await openNewRule();
    fireEvent.click(saveButton());
    expect(await screen.findByText('Add at least one keyword.')).toBeTruthy();
    expect(screen.getByText('Write the reply text.')).toBeTruthy();
    expect(api.posts).toHaveLength(0);
  });

  it('adds keywords with Enter and saves the rule with several keywords', async () => {
    renderSection();
    await openNewRule();
    const keywordInput = screen.getByLabelText('Keywords', { selector: 'input' });
    fireEvent.change(keywordInput, { target: { value: 'refund' } });
    fireEvent.keyDown(keywordInput, { key: 'Enter' });
    fireEvent.change(keywordInput, { target: { value: 'Money back, REFUND' } });
    fireEvent.keyDown(keywordInput, { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Reply text'), { target: { value: 'See example.com' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.posts).toHaveLength(1));
    expect(api.posts[0]).toMatchObject({
      keywords: ['refund', 'Money back'],
      replyText: 'See example.com',
    });
    expect(await screen.findByRole('list', { name: 'Keyword rules' })).toBeTruthy();
  });

  it('a 400 naming a field shows it inline', async () => {
    api.postError = Object.assign(new Error('Validation error'), {
      isAxiosError: true,
      response: {
        status: 400,
        data: { success: false, error: 'Validation error', fields: ['replyText'] },
      },
    });
    renderSection();
    await openNewRule();
    fireEvent.change(screen.getByLabelText('Keywords', { selector: 'input' }), {
      target: { value: 'refund' },
    });
    fireEvent.change(screen.getByLabelText('Reply text'), { target: { value: 'x' } });
    fireEvent.click(saveButton());
    expect(await screen.findByText('Write the reply text.')).toBeTruthy();
  });

  it("a keyword another rule has: the server's sentence shows under Keywords", async () => {
    const clash =
      '"refund" is already a keyword of the rule "Refunds". An email with it would match both rules and get no auto-reply — keep it in one rule only.';
    api.postError = Object.assign(new Error(clash), {
      isAxiosError: true,
      response: {
        status: 400,
        data: { success: false, error: clash, code: 'VALIDATION_FAILED', fields: ['keywords'] },
      },
    });
    renderSection();
    await openNewRule();
    fireEvent.change(screen.getByLabelText('Keywords', { selector: 'input' }), {
      target: { value: 'refund' },
    });
    fireEvent.change(screen.getByLabelText('Reply text'), { target: { value: 'x' } });
    fireEvent.click(saveButton());
    expect(await screen.findByText(clash)).toBeTruthy();
    expect(screen.queryByText('Check the keywords: at least one is needed.')).toBeNull();
  });

  it('switching on a rule whose keyword clashes shows the server message in an alert', async () => {
    const clash =
      '"refund" is already a keyword of the rule "Refunds". An email with it would match both rules and get no auto-reply — keep it in one rule only.';
    api.rules = [{ ...refundRule, id: 2, name: 'Money', enabled: false }];
    api.patchError = Object.assign(new Error(clash), {
      isAxiosError: true,
      response: {
        status: 400,
        data: { success: false, error: clash, code: 'VALIDATION_FAILED', fields: ['keywords'] },
      },
    });
    const alerts: { variant?: string; description?: string }[] = [];
    renderSection(true, true, (alert) => alerts.push(alert));
    fireEvent.click(await screen.findByRole('switch', { name: /turn on rule money/i }));
    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0].variant).toBe('error');
    expect(alerts[0].description).toContain('is already a keyword of the rule "Refunds"');
  });

  it('turns a rule off and deletes it after confirming', async () => {
    api.rules = [refundRule];
    renderSection();
    fireEvent.click(await screen.findByRole('switch', { name: /turn off rule refunds/i }));
    await waitFor(() =>
      expect(api.patches).toEqual([
        { url: '/api/organizations/auto-reply/rules/1', body: { enabled: false } },
      ])
    );
    fireEvent.click(screen.getByRole('button', { name: /delete rule refunds/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(api.deletes).toEqual(['/api/organizations/auto-reply/rules/1']));
  });

  it('without MANAGE_AUTO_REPLY the rules are listed with no controls', async () => {
    api.rules = [refundRule];
    renderSection(false);
    expect(await screen.findByText('Refunds')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add rule/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete rule/i })).toBeNull();
  });

  it("says a rule's reply is checked by the workspace's AI provider, and held when none is set up", async () => {
    renderSection();
    expect(
      await screen.findByText(
        (_text, element) =>
          element?.tagName === 'P' && (element.textContent ?? '').includes(RULE_CHECK_NOTE)
      )
    ).toBeTruthy();
    expect(RULE_CHECK_NOTE).toMatch(/your workspace's AI provider checks/);
    expect(RULE_CHECK_NOTE).toMatch(
      /When no AI provider is set up, or the check cannot run, the reply is held for a person and not sent\./
    );
  });

  it('warns that rules send nothing while auto-reply is off', async () => {
    renderSection(true, false);
    expect(await screen.findByText(/Automatic email replies are off/)).toBeTruthy();
  });

  it('template + knowledge base: the switch, the placeholder button, and the saved flag', async () => {
    renderSection();
    await openNewRule();
    fireEvent.change(screen.getByLabelText('Keywords', { selector: 'input' }), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('switch', { name: /knowledge base/i }));
    fireEvent.change(screen.getByLabelText('Reply template'), { target: { value: 'Hello,' } });
    fireEvent.click(screen.getByRole('button', { name: /insert \{\{kb_answer\}\}/i }));
    expect(screen.getByLabelText('Reply template')).toHaveProperty(
      'value',
      'Hello,\n\n{{kb_answer}}'
    );
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.posts).toHaveLength(1));
    expect(api.posts[0]).toMatchObject({
      useKnowledgeBase: true,
      replyText: 'Hello,\n\n{{kb_answer}}',
      kbMinSimilarity: 0.87,
    });
    expect(await screen.findByText(/Template \+ KB/)).toBeTruthy();
  });

  it('M5: the knowledge base match is sent as typed; out of range is an inline error', async () => {
    renderSection();
    await openNewRule();
    fireEvent.change(screen.getByLabelText('Keywords', { selector: 'input' }), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('switch', { name: /knowledge base/i }));
    fireEvent.change(screen.getByLabelText('Reply template'), {
      target: { value: 'Hi\n\n{{kb_answer}}' },
    });
    fireEvent.change(screen.getByLabelText('Knowledge base match (%)'), {
      target: { value: '75' },
    });
    fireEvent.click(saveButton());
    expect(await screen.findByText(/whole number from 80 to 99/)).toBeTruthy();
    expect(api.posts).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Knowledge base match (%)'), {
      target: { value: '82' },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.posts).toHaveLength(1));
    expect(api.posts[0]).toMatchObject({ useKnowledgeBase: true, kbMinSimilarity: 0.82 });
  });

  it('the knowledge base match sits under a closed "Advanced", summarised without a number', async () => {
    renderSection();
    await openNewRule();
    fireEvent.click(screen.getByRole('switch', { name: /knowledge base/i }));
    const field = screen.getByLabelText('Knowledge base match (%)');
    expect(field).not.toBeVisible();
    const header = screen.getByRole('button', { name: /^Advanced/ });
    expect(header).toHaveTextContent('Match strictness: standard');
    expect(screen.getByText(/as closely as the match set under Advanced/)).toBeTruthy();
    fireEvent.click(header);
    expect(field).toBeVisible();
    fireEvent.change(field, { target: { value: '92' } });
    expect(header).toHaveTextContent('Match strictness: custom');
  });

  it('a match validation error opens "Advanced"; the field stays after the next keystroke', async () => {
    renderSection();
    await openNewRule();
    fireEvent.change(screen.getByLabelText('Keywords', { selector: 'input' }), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('switch', { name: /knowledge base/i }));
    fireEvent.change(screen.getByLabelText('Reply template'), {
      target: { value: 'Hi\n\n{{kb_answer}}' },
    });
    fireEvent.change(screen.getByLabelText('Knowledge base match (%)'), {
      target: { value: '75' },
    });
    fireEvent.click(saveButton());
    expect(await screen.findByText(/whole number from 80 to 99/)).toBeVisible();
    const field = screen.getByLabelText('Knowledge base match (%)');
    expect(field).toBeVisible();
    fireEvent.change(field, { target: { value: '8' } });
    expect(screen.queryByText(/whole number from 80 to 99/)).toBeNull();
    expect(field).toBeVisible();
  });

  it('CONTROL — a plain rule is saved without the knowledge base', async () => {
    renderSection();
    await openNewRule();
    fireEvent.change(screen.getByLabelText('Keywords', { selector: 'input' }), {
      target: { value: 'refund' },
    });
    fireEvent.change(screen.getByLabelText('Reply text'), { target: { value: 'See example.com' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.posts).toHaveLength(1));
    expect(api.posts[0]).toMatchObject({ useKnowledgeBase: false });
    expect(api.posts[0]).not.toHaveProperty('kbMinSimilarity');
    expect(screen.queryByLabelText('Knowledge base match (%)')).toBeNull();
    expect(screen.queryByText(/Template \+ KB/)).toBeNull();
  });
});

describe('Keyword rules: no AI provider to check the replies', () => {
  const warning = () => screen.queryByText(NO_AI_PROVIDER_WARNING, { exact: false });
  /** The rules are listed and the providers request has had time to settle. */
  const settled = async () => {
    await screen.findByText('Refunds');
    await new Promise((resolve) => setTimeout(resolve, 20));
  };

  it('a switched-on rule and no AI provider: the warning, with a link to the AI providers', async () => {
    api.rules = [refundRule];
    api.ai = 'none';
    renderSection();
    await waitFor(() => expect(warning()).toBeTruthy());
    expect(NO_AI_PROVIDER_WARNING).toBe(
      'No AI provider is set up. Every keyword rule reply is checked by AI before it is sent, so until a provider is set up no rule reply is sent: each one is held for a person.'
    );
    const link = screen.getByRole('link', { name: 'Set up an AI provider' });
    expect(link.getAttribute('href')).toBe('/settings#integrations/ai-providers');
  });

  it('someone who cannot manage integrations is told to ask an admin, with no link', async () => {
    api.rules = [refundRule];
    api.ai = 'none';
    api.canManageIntegrations = false;
    renderSection();
    await waitFor(() => expect(warning()).toBeTruthy());
    expect(screen.getByText(/Ask a workspace admin to set one up\./)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Set up an AI provider' })).toBeNull();
  });

  it('CONTROL — an AI provider is set up: no warning', async () => {
    api.rules = [refundRule];
    renderSection();
    await settled();
    expect(warning()).toBeNull();
  });

  it('no warning while the providers answer is still loading', async () => {
    api.rules = [refundRule];
    api.ai = 'pending';
    renderSection();
    await settled();
    expect(warning()).toBeNull();
  });

  it('no warning when the providers request failed: the answer is unknown', async () => {
    api.rules = [refundRule];
    api.ai = 'error';
    renderSection();
    await settled();
    expect(warning()).toBeNull();
  });

  it('no warning without a switched-on rule: none at all, or only rules that are off', async () => {
    api.ai = 'none';
    renderSection();
    await screen.findByText(/No keyword rules yet/);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(warning()).toBeNull();
    cleanup();

    api.rules = [{ ...refundRule, enabled: false }];
    renderSection();
    await settled();
    expect(warning()).toBeNull();
  });

  it('no second warning while automatic replies are off: nothing is checked or held then', async () => {
    api.rules = [refundRule];
    api.ai = 'none';
    renderSection(true, false);
    await settled();
    expect(screen.getByText(/Automatic email replies are off/)).toBeTruthy();
    expect(warning()).toBeNull();
  });

  it('switching the last rule off removes the warning', async () => {
    api.rules = [refundRule];
    api.ai = 'none';
    renderSection();
    await waitFor(() => expect(warning()).toBeTruthy());
    fireEvent.click(screen.getByRole('switch', { name: 'Turn off rule Refunds' }));
    await waitFor(() => expect(warning()).toBeNull());
  });
});

describe('Keyword rules: the backend says whether its AI can be used (`usable`)', () => {
  const held = () => screen.queryByRole('status', { name: 'Keyword rule replies are held' });
  const settled = async () => {
    await screen.findByText('Refunds');
    await new Promise((resolve) => setTimeout(resolve, 20));
  };

  it('a provider row that cannot be used: its own warning and link, not "none is set up"', async () => {
    api.rules = [refundRule];
    api.ai = 'configured';
    api.usable = false;
    renderSection();
    await waitFor(() => expect(held()).toBeTruthy());
    expect(held()?.textContent).toContain(UNUSABLE_AI_PROVIDER_WARNING);
    expect(held()?.textContent).not.toContain(NO_AI_PROVIDER_WARNING);
    expect(screen.getByRole('link', { name: 'Check the AI provider' }).getAttribute('href')).toBe(
      '/settings#integrations/ai-providers'
    );
  });

  it('the backend could not tell (null): no warning, although no provider row came back', async () => {
    api.rules = [refundRule];
    api.ai = 'none';
    api.usable = null;
    renderSection();
    await settled();
    expect(held()).toBeNull();
  });

  it('usable: no warning, whatever the rows say', async () => {
    api.rules = [refundRule];
    api.ai = 'none';
    api.usable = true;
    renderSection();
    await settled();
    expect(held()).toBeNull();
  });

  it('no provider and not usable: the "none is set up" warning', async () => {
    api.rules = [refundRule];
    api.ai = 'none';
    api.usable = false;
    renderSection();
    await waitFor(() => expect(held()?.textContent).toContain(NO_AI_PROVIDER_WARNING));
  });

  it('a backend without the answer, workspace on platform AI: no warning', async () => {
    api.rules = [refundRule];
    api.ai = 'none';
    api.platformActive = true;
    renderSection();
    await settled();
    expect(held()).toBeNull();
  });

  it('coming back to the screen asks again: a provider added meanwhile removes the warning', async () => {
    // The app's own default (lib/queryClient): with a client that has no stale time every query
    // re-reads on mount anyway, and the hook's own "always ask again" would not be under test.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    const mount = () =>
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AutoReplyRulesSection canManage autoReplyEnabled onShowAlert={() => undefined} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    api.rules = [refundRule];
    api.ai = 'none';
    const first = mount();
    await waitFor(() => expect(held()).toBeTruthy());
    first.unmount();
    // The admin adds a provider on another screen, then returns: same cache, the answer is new.
    api.ai = 'configured';
    const readsBefore = api.providerReads;
    mount();
    await settled();
    expect(api.providerReads).toBe(readsBefore + 1);
    expect(held()).toBeNull();
  });
});

describe('Keyword rules: nothing is claimed while the answer is being asked again', () => {
  const held = () => screen.queryByRole('status', { name: 'Keyword rule replies are held' });

  it('on return the old "none is set up" does not flash while the new answer is on its way', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    const mount = () =>
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AutoReplyRulesSection canManage autoReplyEnabled onShowAlert={() => undefined} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    api.rules = [refundRule];
    api.ai = 'none';
    const first = mount();
    await waitFor(() => expect(held()).toBeTruthy());
    first.unmount();
    // The re-read never settles: all the screen has is the previous answer, which may be stale.
    api.ai = 'pending';
    mount();
    await screen.findByText('Refunds');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(held()).toBeNull();
  });
});

describe('Keyword rules: keywords the backend ignores (deep review 2026-11-16)', () => {
  it('names the ignored keywords on the rule, and shows nothing for a rule without any (control)', async () => {
    api.rules = [
      {
        id: 1,
        name: 'Old rule',
        keywords: ['order', 'refund'],
        replyText: 'Text',
        enabled: true,
        ignoredKeywords: ['order'],
      },
      { id: 2, name: 'Clean rule', keywords: ['iban'], replyText: 'Text', enabled: true },
    ];
    renderSection();
    expect(
      await screen.findByText(/Ignored, too short or too common: "order"/)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Ignored, too short or too common/)).toHaveLength(1);
  });
});
