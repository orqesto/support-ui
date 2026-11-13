/**
 * Keyword auto-reply rules (Settings → AI → Auto-Reply): add, inline errors, toggle, delete, and
 * the read-only list for someone without MANAGE_AUTO_REPLY. Runs the real service over a fake
 * apiClient. Invented data.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({
  rules: [] as Record<string, unknown>[],
  posts: [] as unknown[],
  patches: [] as { url: string; body: unknown }[],
  deletes: [] as string[],
  postError: null as Error | null,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () => Promise.resolve({ data: { success: true, data: api.rules } }),
    post: (_url: string, body: Record<string, unknown>) => {
      api.posts.push(body);
      if (api.postError) return Promise.reject(api.postError);
      return Promise.resolve({
        data: { success: true, data: { id: 99, enabled: true, ...body } },
      });
    },
    patch: (url: string, body: Record<string, unknown>) => {
      api.patches.push({ url, body });
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
  api.deletes = [];
  api.postError = null;
});
afterEach(cleanup);

const renderSection = (canManage = true, autoReplyEnabled = true) =>
  render(
    <AutoReplyRulesSection
      canManage={canManage}
      autoReplyEnabled={autoReplyEnabled}
      onShowAlert={() => undefined}
    />
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
    api.postError = Object.assign(new Error('Invalid'), {
      isAxiosError: true,
      response: { status: 400, data: { success: false, error: 'Invalid', fields: ['replyText'] } },
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

  it('warns that rules send nothing while auto-reply is off', async () => {
    renderSection(true, false);
    expect(await screen.findByText(/Auto-reply is off/)).toBeTruthy();
  });
});
