import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AiTabPanel } from '../AiTabPanel';
import type { Message } from '@/types';

/**
 * The past-reply privacy hint is for a reply sent to ANOTHER customer. The similar-results search
 * also returns KB (documentation) hits, and those share the `sim-` option ids: selecting one must
 * not say "a reply sent to another customer".
 */

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
const PAST_REPLY = {
  messageId: 77,
  directReply: 'Hi Joy, sorry about the size.',
  similarity: 0.7,
  source: 'message',
  sender: 'Joy <j.nowak@example.net>',
};
const similar = vi.hoisted(() => ({ rows: null as unknown[] | null, calls: 0 }));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: () => {
      similar.calls += 1;
      return Promise.resolve({
        success: true,
        data: similar.rows ?? [
          {
            documentationId: 3,
            documentTitle: 'Sizing guide',
            directReply: 'Our sizing guide covers this.',
            similarity: 0.8,
            source: 'documentation',
          },
          PAST_REPLY,
        ],
      });
    },
  },
}));

const messageWithId = (id: number) =>
  ({
    id,
    sender: 'a@b.example',
    channel: 'email',
    createdAt: '2026-09-22T10:00:00Z',
    metadata: {},
  }) as unknown as Message;

describe('AiTabPanel — the past-reply hint', () => {
  it('a KB hit from the similar search (id sim-…) shows no past-reply hint; a past reply does', async () => {
    const message = {
      id: 8800,
      sender: 'a@b.example',
      channel: 'email',
      createdAt: '2026-09-22T10:00:00Z',
      metadata: {},
    } as unknown as Message;
    render(
      <MemoryRouter>
        <AiTabPanel message={message} onGhostClick={() => {}} section="suggested" />
      </MemoryRouter>
    );
    const group = await screen.findByRole('group', { name: 'Suggestion source' });
    const kb = within(group).getByRole('button', { name: 'KB 80%' });
    await userEvent.click(kb);
    expect(kb.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('past-reply-hint')).toBeNull();
    // CONTROL: the same panel does show it for the past reply.
    await userEvent.click(
      within(group).getByRole('button', { name: 'PAST REPLY 70% → j.nowak@example.net' })
    );
    expect(screen.getByTestId('past-reply-hint')).toBeTruthy();
  });

  describe('when the first option is a past reply', () => {
    it('the AI tab (section analysis) shows no past-reply hint', async () => {
      similar.rows = [PAST_REPLY];
      similar.calls = 0;
      render(
        <MemoryRouter>
          <AiTabPanel message={messageWithId(8802)} onGhostClick={() => {}} section="analysis" />
        </MemoryRouter>
      );
      await waitFor(() => expect(similar.calls).toBe(1));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByTestId('past-reply-hint')).toBeNull();
      similar.rows = null;
    });

    it('CONTROL: the suggested section shows it', async () => {
      similar.rows = [PAST_REPLY];
      render(
        <MemoryRouter>
          <AiTabPanel message={messageWithId(8803)} onGhostClick={() => {}} section="suggested" />
        </MemoryRouter>
      );
      expect(await screen.findByTestId('past-reply-hint')).toBeTruthy();
      similar.rows = null;
    });
  });
});
