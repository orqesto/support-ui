import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AiTabPanel } from '../AiTabPanel';
import type { Message } from '@/types';

/**
 * The count AiTabPanel reports must match the options it renders: the KB tab badge and the ghost
 * bubble's "+N more" both read it. Once an auto-reply was sent the AI answer is not offered, so
 * it must not be counted either.
 */

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: () => Promise.resolve({ success: true, data: [] }),
  },
}));

let nextId = 500;
const renderPanel = (metadata: Record<string, unknown>) => {
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
      />
    </MemoryRouter>
  );
  return onOptionsLoaded;
};

const answer = { suggestedAnswer: { answer: 'Hello, here is how.', source: 'ai' } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiTabPanel — reported option count', () => {
  it('counts the AI answer while it is offered', async () => {
    const onOptionsLoaded = renderPanel(answer);
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenCalledWith(1));
  });

  it('does not count the AI answer once an auto-reply was sent (it is not offered)', async () => {
    const onOptionsLoaded = renderPanel({ ...answer, autoReply: { sent: true } });
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenCalled());
    expect(onOptionsLoaded).toHaveBeenLastCalledWith(0);
  });
});
