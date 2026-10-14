import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AiTabPanel } from '../AiTabPanel';
import type { Message } from '@/types';

/**
 * 🔴 Found recording a demo (2026-10-14): a KB option's source link in a thread's KB tab went to
 * `/knowledge-base?docId=<id>#documentation` — the UPLOADED documentation tab's own parameter —
 * so it opened the empty Documentation upload tab instead of the entry. The id on a KB hit is a
 * knowledge-base ENTRY id, which the KB page opens by `?id=`.
 */

const similar = vi.fn<() => Promise<unknown>>();
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getSimilarResolvedMessages: () => similar() },
}));

let nextId = 900;
const renderPanel = () =>
  render(
    <MemoryRouter>
      <AiTabPanel
        message={
          {
            id: nextId++, // the panel caches results per conversation
            sender: 'a@b.example',
            channel: 'email',
            createdAt: '2026-10-14T10:00:00Z',
            metadata: {},
          } as unknown as Message
        }
        onGhostClick={() => {}}
        section="suggested"
      />
    </MemoryRouter>
  );

describe('AiTabPanel — the KB option links to its entry', () => {
  it('🔴 a KB hit opens /knowledge-base?id=<entry id>, not the Documentation upload tab', async () => {
    similar.mockResolvedValue({
      success: true,
      data: [
        {
          source: 'documentation',
          documentationId: 42,
          documentTitle: 'Q: Can I change the delivery address?',
          directReply: 'Yes, until the parcel reaches the local depot.',
          similarity: 0.93,
        },
      ],
    });
    renderPanel();

    const link = await screen.findByRole('link', { name: /Can I change the delivery address/ });
    expect(link.getAttribute('href')).toBe('/knowledge-base?id=42');
  });

  it('control: a past reply carries no knowledge-base link', async () => {
    similar.mockResolvedValue({
      success: true,
      data: [
        {
          source: 'message',
          messageId: 7,
          sender: 'Someone <someone@example.com>',
          directReply: 'We have changed the address for you.',
          similarity: 0.96,
        },
      ],
    });
    renderPanel();

    await screen.findByText(/We have changed the address for you/);
    expect(screen.queryByRole('link', { name: /knowledge base/i })).toBeNull();
    expect(
      screen
        .queryAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('/knowledge-base'))
    ).toHaveLength(0);
  });
});
