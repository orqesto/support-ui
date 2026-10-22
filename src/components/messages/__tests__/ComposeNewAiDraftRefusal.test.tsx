/**
 * Release review finding 1: AI draft in "Compose new message" (polish) refused because the Free
 * starter allowance is used up — 402 or 429 with FREE_AI_ALLOWANCE_USED — tells the agent so,
 * never "try again".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { apiError } from '@/test/apiError';

let refusal: Error = new Error('unset');
/** The error the call site really catches (through the real api-client interceptor). */
const refuse = async (status: number, body: Record<string, unknown>) => {
  refusal = (await apiError(status, body)) as Error;
};
vi.mock('@/services/message.service', () => ({
  messageService: { composePolish: () => Promise.reject(refusal) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: true, isLoading: false }),
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => vi.fn(),
}));

const { ComposeNewAiDraft } = await import('../ComposeNewAiDraft');

const notes: Array<{ text: string } | null> = [];
const press = () => {
  const view = render(
    <ComposeNewAiDraft
      content="<p>please send the parcel</p>"
      setContent={vi.fn()}
      onNoteChange={(note) => notes.push(note)}
    />
  );
  fireEvent.click(view.getByRole('button', { name: /AI draft/ }));
};
const lastNote = () => notes.filter(Boolean).at(-1)?.text ?? '';

beforeEach(() => {
  notes.length = 0;
});
afterEach(cleanup);

describe('ComposeNewAiDraft: Free starter allowance used up', () => {
  it.each([402, 429])('%i FREE_AI_ALLOWANCE_USED → the allowance sentence', async (status) => {
    await refuse(status, {
      code: 'FREE_AI_ALLOWANCE_USED',
      error: 'Your free AI allowance is used. Add your own AI key to keep AI running.',
    });
    press();
    await waitFor(() =>
      expect(lastNote()).toMatch(/Your free AI allowance is used — ask your admin/)
    );
    expect(lastNote()).not.toMatch(/AI limit reached|try again/i);
  });

  it('a plain 429 still reads as a limit for now (control)', async () => {
    await refuse(429, { error: 'Too many requests.' });
    press();
    await waitFor(() => expect(lastNote()).toMatch(/AI limit reached for now/));
  });
});
