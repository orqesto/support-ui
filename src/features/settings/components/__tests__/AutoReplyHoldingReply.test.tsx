/**
 * Keyword auto-reply rules: the per-rule "Holding reply" switch (owner 2026-11-27) — the form, the
 * save payload (sent only when on or changed, for a backend without the field) and the list badge.
 * Runs the real service over a fake apiClient. Invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  rules: [] as Record<string, unknown>[],
  posts: [] as unknown[],
  patches: [] as { url: string; body: unknown }[],
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) =>
      Promise.resolve({
        data: {
          success: true,
          data:
            url === '/api/ai/providers'
              ? { enabled: [{ provider: 'openai' }], available: [], platform: { active: false } }
              : api.rules,
        },
      }),
    post: (_url: string, body: Record<string, unknown>) => {
      api.posts.push(body);
      return Promise.resolve({ data: { success: true, data: { id: 99, enabled: true, ...body } } });
    },
    patch: (url: string, body: Record<string, unknown>) => {
      api.patches.push({ url, body });
      const id = Number(url.split('/').pop());
      const current = api.rules.find((rule) => rule['id'] === id) ?? {};
      return Promise.resolve({ data: { success: true, data: { ...current, ...body, id } } });
    },
    delete: () => Promise.resolve({ data: { success: true } }),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

const { AutoReplyRulesSection } = await import('../AutoReplyRulesSection');

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
});
afterEach(cleanup);

const renderSection = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <AutoReplyRulesSection canManage autoReplyEnabled onShowAlert={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>
  );

const openNewRule = async () => {
  await screen.findByText(/No keyword rules yet/);
  fireEvent.click(screen.getByRole('button', { name: /add rule/i }));
};

const saveButton = () =>
  within(screen.getByTestId('auto-reply-rule-form')).getByRole('button', {
    name: /add rule|save rule/i,
  });

describe('Keyword rules: holding reply (2026-11-27)', () => {
  const holdingSwitch = () =>
    screen.getByRole('switch', { name: /holding reply \(the team still answers\)/i });
  const fillNewRule = () => {
    fireEvent.change(screen.getByLabelText('Keywords', { selector: 'input' }), {
      target: { value: 'refund' },
    });
    fireEvent.change(screen.getByLabelText('Reply text'), { target: { value: 'See example.com' } });
  };

  it('a new rule starts off, says when it is sent, and does not send the field', async () => {
    renderSection();
    await openNewRule();
    expect(holdingSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/only when it fully answers what the customer asks/)).toBeTruthy();
    fillNewRule();
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.posts).toHaveLength(1));
    expect(api.posts[0]).not.toHaveProperty('holdingReply');
  });

  it('turned on, it says the team still answers and sends holdingReply: true', async () => {
    renderSection();
    await openNewRule();
    fillNewRule();
    fireEvent.click(holdingSwitch());
    expect(holdingSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByText(/the team will answer, so it is sent whenever they write/)
    ).toBeTruthy();
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.posts).toHaveLength(1));
    expect(api.posts[0]).toMatchObject({ holdingReply: true });
  });

  it('an edit sends it only when changed', async () => {
    api.rules = [{ ...refundRule, holdingReply: true }];
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: /edit rule refunds/i }));
    expect(holdingSwitch()).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('Reply text'), { target: { value: 'New text' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.patches).toHaveLength(1));
    expect(api.patches[0].body).not.toHaveProperty('holdingReply');
  });

  it('an edit that turns it off sends false', async () => {
    api.rules = [{ ...refundRule, holdingReply: true }];
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: /edit rule refunds/i }));
    fireEvent.click(holdingSwitch());
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.patches).toHaveLength(1));
    expect(api.patches[0].body).toMatchObject({ holdingReply: false });
  });

  it('the list tags a holding-reply rule, and not one without it (control)', async () => {
    api.rules = [
      { ...refundRule, holdingReply: true },
      { ...refundRule, id: 2, name: 'Shipping', keywords: ['shipping'] },
      { ...refundRule, id: 3, name: 'Returns', keywords: ['returns'], holdingReply: 'yes' },
    ];
    renderSection();
    const list = await screen.findByRole('list', { name: 'Keyword rules' });
    expect(within(list).getAllByText('Holding reply')).toHaveLength(1);
    const items = within(list).getAllByRole('listitem');
    expect(within(items[0]).getByText('Holding reply')).toBeInTheDocument();
  });
});
