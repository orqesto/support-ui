/**
 * Release review finding 8: a translation refused with an AI refusal code toasts a sentence that
 * offers an agent nothing they cannot do — never the server's "Buying more messages or upgrading"
 * budget sentence. Admins read the server's (money-free) sentence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiError } from '@/test/apiError';

const toastError = vi.fn<(message: string) => void>();
vi.mock('@/lib/toast', () => ({
  toast: { error: (message: string) => toastError(message), success: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: true, isLoading: false }),
}));
let refusal: Error = new Error('unset');
/** The error the call site really catches (through the real api-client interceptor). */
const refuse = async (status: number, body: Record<string, unknown>) => {
  refusal = (await apiError(status, body)) as Error;
};
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    translateMessage: () => Promise.reject(refusal),
    translateTicket: () => Promise.reject(refusal),
    translateText: () => Promise.reject(refusal),
    isTranslating: false,
  }),
  useSupportedLanguages: () => ({
    languages: [{ code: 'de', name: 'German' }],
    fetchLanguages: vi.fn(),
  }),
}));
let viewer: { role: string; organizationRole: string } | null = null;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ user: viewer }),
}));

const { TranslateButton } = await import('../TranslateButton');

const BUDGET =
  "This period's AI messages are used up. Buying more messages or upgrading adds to it.";

const translate = async () => {
  render(<TranslateButton messageId={5} onTranslated={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
  fireEvent.click(await screen.findByRole('option', { name: 'German' }));
  await waitFor(() => expect(toastError).toHaveBeenCalled());
  return toastError.mock.calls[0][0];
};

beforeEach(() => {
  toastError.mockReset();
  viewer = { role: 'user', organizationRole: 'support' };
});
afterEach(cleanup);

describe('TranslateButton: AI refusals', () => {
  it('an agent never reads the buying sentence (402 AI_BUDGET_PAUSED)', async () => {
    await refuse(402, { code: 'AI_BUDGET_PAUSED', error: BUDGET });
    const text = await translate();
    expect(text).toMatch(/Ask your admin/);
    expect(text).not.toMatch(/Buying|upgrad/i);
  });

  it('an agent reads the allowance sentence (402 FREE_AI_ALLOWANCE_USED)', async () => {
    await refuse(402, {
      code: 'FREE_AI_ALLOWANCE_USED',
      error: 'Your free AI allowance is used. Add your own AI key to keep AI running.',
    });
    expect(await translate()).toMatch(/Your free AI allowance is used — ask your admin/);
  });

  it('the old backend code (AI_USAGE_LIMIT_EXCEEDED) is mapped too', async () => {
    await refuse(402, { code: 'AI_USAGE_LIMIT_EXCEEDED', error: 'Upgrade your plan.' });
    expect(await translate()).not.toMatch(/Upgrade/);
  });

  it('an admin reads the server sentence', async () => {
    viewer = { role: 'user', organizationRole: 'org_admin' };
    await refuse(402, { code: 'AI_BUDGET_PAUSED', error: BUDGET });
    expect(await translate()).toBe(BUDGET);
  });

  it('any other failure keeps the server message', async () => {
    await refuse(400, { error: 'Unsupported language.' });
    expect(await translate()).toMatch(/Unsupported language/);
  });
});
