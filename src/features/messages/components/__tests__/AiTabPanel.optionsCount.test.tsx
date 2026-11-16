import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AiTabPanel } from '../AiTabPanel';
import type { Message } from '@/types';

/**
 * The count AiTabPanel reports must match the options it renders: the KB tab badge and the ghost
 * bubble's "+N more" both read it. Once an auto-reply was sent the AI answer is not offered, so
 * it must not be counted either.
 */

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
const similar = vi.hoisted(() => ({ fail: false, data: [] as unknown[] }));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: () =>
      similar.fail
        ? Promise.reject(new Error('network'))
        : Promise.resolve({ success: true, data: similar.data }),
  },
}));

let nextId = 500;
const renderPanel = (metadata: Record<string, unknown>, hideStoredDraft?: boolean) => {
  const onOptionsLoaded = vi.fn();
  const message = {
    id: nextId++, // a fresh id per test: the panel caches results per conversation
    sender: 'a@b.example',
    channel: 'email',
    createdAt: '2026-09-22T10:00:00Z',
    metadata,
  } as unknown as Message;
  render(
    <MemoryRouter>
      <AiTabPanel
        message={message}
        onGhostClick={() => {}}
        onOptionsLoaded={onOptionsLoaded}
        section="suggested"
        {...(hideStoredDraft === undefined ? {} : { hideStoredDraft })}
      />
    </MemoryRouter>
  );
  return { onOptionsLoaded };
};

const answer = { suggestedAnswer: { answer: 'Hello, here is how.', source: 'ai' } };

beforeEach(() => {
  vi.clearAllMocks();
  similar.fail = false;
  similar.data = [];
});

describe('AiTabPanel — reported option count', () => {
  it('counts the AI answer while it is offered', async () => {
    const { onOptionsLoaded } = renderPanel(answer);
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenCalledWith(1));
  });

  it('does not count the AI answer once an auto-reply was sent (it is not offered)', async () => {
    const { onOptionsLoaded } = renderPanel({ ...answer, autoReply: { sent: true } });
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenCalled());
    expect(onOptionsLoaded).toHaveBeenLastCalledWith(0);
  });

  // 2026-11-16: a stored draft for the customer's EARLIER email is not offered (the thread decides,
  // storedDraftFreshness.ts) — nor counted.
  it('a hidden stored draft is neither offered nor counted', async () => {
    const { onOptionsLoaded } = renderPanel(answer, true);
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenCalled());
    expect(onOptionsLoaded).toHaveBeenLastCalledWith(0);
  });

  it('hidden AFTER the matches arrived (the thread loaded later): the count follows', async () => {
    const onOptionsLoaded = vi.fn();
    const message = {
      id: nextId++,
      sender: 'a@b.example',
      channel: 'email',
      createdAt: '2026-09-22T10:00:00Z',
      metadata: answer,
    } as unknown as Message;
    const panel = (hideStoredDraft: boolean) => (
      <MemoryRouter>
        <AiTabPanel
          message={message}
          onGhostClick={() => {}}
          onOptionsLoaded={onOptionsLoaded}
          section="suggested"
          hideStoredDraft={hideStoredDraft}
        />
      </MemoryRouter>
    );
    const { rerender } = render(panel(false));
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenLastCalledWith(1));
    rerender(panel(true));
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenLastCalledWith(0));
  });

  it('the matches failed to load: no count is reported (the badge stays unset)', async () => {
    similar.fail = true;
    const { onOptionsLoaded } = renderPanel(answer);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onOptionsLoaded).not.toHaveBeenCalled();
  });

  it('two matches from the same KB entry get distinct options (no shared key)', async () => {
    const kbHit = (content: string) => ({
      source: 'documentation',
      documentationId: 7,
      directReply: content,
      content,
      similarity: 0.9,
    });
    similar.data = [kbHit('first'), kbHit('second')];
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { onOptionsLoaded } = renderPanel({});
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenLastCalledWith(2));
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    errors.mockRestore();
  });

  // Review round 6: while whether the stored draft is offered is unknown, the list waits — or a
  // past reply to another customer is the default option, one click from the composer.
  it('while the stored draft is pending: no "Use in reply", no count; then both', async () => {
    similar.data = [
      {
        source: 'message',
        messageId: 41,
        directReply: 'Hi Sam, your refund is on its way.',
        content: 'Where is my refund?',
        sender: 'sam@other.example',
        similarity: 0.9,
      },
    ];
    const onOptionsLoaded = vi.fn();
    const message = {
      id: nextId++,
      sender: 'a@b.example',
      channel: 'email',
      createdAt: '2026-09-22T10:00:00Z',
      metadata: answer,
    } as unknown as Message;
    const panel = (pending: boolean) => (
      <MemoryRouter>
        <AiTabPanel
          message={message}
          onGhostClick={() => {}}
          onOptionsLoaded={onOptionsLoaded}
          section="suggested"
          hideStoredDraft={pending}
          storedDraftPending={pending}
        />
      </MemoryRouter>
    );
    const { rerender } = render(panel(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('button', { name: /Use in reply/ })).toBeNull();
    expect(onOptionsLoaded).not.toHaveBeenCalled();
    rerender(panel(false));
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenLastCalledWith(2));
    expect(screen.getByRole('button', { name: /Use in reply/ })).toBeTruthy();
  });
});
