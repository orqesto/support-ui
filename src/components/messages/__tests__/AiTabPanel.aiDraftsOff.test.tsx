import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AiTabPanel } from '../AiTabPanel';
import type { Message } from '@/types';

/**
 * A reply a model wrote BEFORE the workspace switched AI drafts off is still stored on the
 * message. The backend cannot refuse it — it is already in the payload — so this panel is the
 * only thing that keeps it from being offered with a "Use" button.
 */

const aiDrafts = { off: false, resolved: true };
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: aiDrafts.resolved }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: () => Promise.resolve({ success: true, data: [] }),
  },
}));

const STORED = 'Hello, your refund was approved yesterday.';

let nextId = 900;
const renderPanel = () => {
  const onOptionsLoaded = vi.fn();
  const message = {
    id: nextId++,
    sender: 'a@b.example',
    channel: 'email',
    createdAt: '2026-09-24T10:00:00Z',
    metadata: { suggestedAnswer: { answer: STORED, source: 'ai' } },
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

beforeEach(() => {
  vi.clearAllMocks();
  aiDrafts.off = false;
  aiDrafts.resolved = true;
});

describe('AiTabPanel — AI drafts off', () => {
  it('does not offer the stored AI reply, and says why', async () => {
    aiDrafts.off = true;
    const onOptionsLoaded = renderPanel();
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenCalled());
    expect(onOptionsLoaded).toHaveBeenLastCalledWith(0);
    expect(screen.queryByText(STORED)).not.toBeInTheDocument();
    expect(screen.getByText(/AI drafts are switched off for this workspace/i)).toBeInTheDocument();
  });

  it('does not offer it while the setting is still unknown', async () => {
    aiDrafts.resolved = false;
    const onOptionsLoaded = renderPanel();
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenCalled());
    expect(onOptionsLoaded).toHaveBeenLastCalledWith(0);
    expect(screen.queryByText(STORED)).not.toBeInTheDocument();
  });

  it('offers it with drafts on (control)', async () => {
    const onOptionsLoaded = renderPanel();
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenCalledWith(1));
    expect(screen.getByText(STORED)).toBeInTheDocument();
    expect(screen.queryByText(/AI drafts are switched off/i)).not.toBeInTheDocument();
  });
});
