import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AiTabPanel } from '../AiTabPanel';
import { suggestionNotSentNote } from '../aiFlagCopy';
import type { Message } from '@/types';

/**
 * An automatic reply that was handed over for sending and did not arrive is kept as the thread's
 * draft, marked `notSent` (2026-11-21). The draft says so on its own pill, so an agent does not
 * take it for a reply the customer has. Invented data.
 */

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: () => Promise.resolve({ success: true, data: [] }),
  },
}));

const STORED = 'Hello, your parcel left the warehouse on Monday.';

let nextId = 4100;
const renderPanel = (suggestion: Record<string, unknown>) => {
  const message = {
    id: nextId++,
    sender: 'buyer@shop.example',
    channel: 'email',
    createdAt: '2026-11-21T10:00:00Z',
    needsHumanReview: true,
    needsReviewReason: 'send_failed',
    metadata: { suggestedAnswer: { answer: STORED, confidence: 0.87, ...suggestion } },
  } as unknown as Message;
  render(
    <MemoryRouter>
      <AiTabPanel message={message} onGhostClick={() => {}} section="suggested" />
    </MemoryRouter>
  );
};

describe('AiTabPanel — the kept draft of an automatic reply that did not arrive', () => {
  it.each([
    ['failed', '87% · not sent'],
    ['uncertain', '87% · may not have been delivered'],
  ])('notSent: %s is said on the draft', async (notSent, sublabel) => {
    renderPanel({ notSent });
    expect(await screen.findByText(STORED)).toBeInTheDocument();
    expect(screen.getByText(sublabel, { exact: false })).toBeInTheDocument();
  });

  it('CONTROL — a draft without the mark, or with one this bundle does not know, says nothing of sending', async () => {
    renderPanel({});
    renderPanel({ notSent: 'some_new_mark' });
    expect(await screen.findAllByText(STORED)).toHaveLength(2);
    expect(screen.queryByText(/not sent|may not have been delivered|some_new_mark/)).toBeNull();
    expect(screen.getAllByText('87%', { exact: false }).length).toBeGreaterThan(0);
  });

  it('the words for the mark', () => {
    expect(suggestionNotSentNote('failed')).toBe('not sent');
    expect(suggestionNotSentNote('uncertain')).toBe('may not have been delivered');
    for (const mark of [undefined, null, '', 'toString', true]) {
      expect(suggestionNotSentNote(mark)).toBeNull();
    }
  });
});
