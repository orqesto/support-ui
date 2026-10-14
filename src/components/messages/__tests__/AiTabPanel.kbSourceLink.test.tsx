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

/**
 * 🔴 Found recording a demo (2026-10-15): the source link cut a long title mid-word with no "…"
 * ("…already in tr") — a hard `.slice(0, 80)` under a CSS `truncate` that then had nothing left to
 * truncate. The full title is rendered (CSS adds the ellipsis) and kept in the tooltip.
 */
describe('AiTabPanel — a long source title is not cut mid-word', () => {
  const longTitle =
    'Q: Can I still change the delivery address for parcel BL-5893 that is already in transit?';
  const full = longTitle.replace(/^Q:\s*/, '');

  it('🔴 the link carries the whole title, in its text and its tooltip', async () => {
    similar.mockResolvedValue({
      success: true,
      data: [
        {
          source: 'documentation',
          documentationId: 7,
          documentTitle: longTitle,
          directReply: 'Yes, until the parcel reaches the local depot.',
          similarity: 0.91,
        },
      ],
    });
    renderPanel();

    const link = await screen.findByRole('link', { name: full });
    expect(link.textContent).toBe(full);
    expect(link.getAttribute('title')).toBe(full);
    expect(link.className).toMatch(/(?:^|\s)truncate(?:\s|$)/);
  });

  it('control: a short title reads as it is, "Q:" and markup removed', async () => {
    similar.mockResolvedValue({
      success: true,
      data: [
        {
          source: 'documentation',
          documentationId: 8,
          documentTitle: 'Q: <b>Insurance</b> after booking?',
          directReply: 'Yes, until pickup.',
          similarity: 0.9,
        },
      ],
    });
    renderPanel();
    const link = await screen.findByRole('link', { name: 'Insurance after booking?' });
    expect(link.getAttribute('title')).toBe('Insurance after booking?');
  });
});

/**
 * The DOCS answer's `referencedChunks` are DOCUMENTATION-CHUNK ids (BE messageCompletenessAnalyzer:
 * `docResults.map((doc) => doc.id)` over `documentation_chunks` rows). The source link passed the
 * first one as `?docId=` — a document id — so it highlighted another document, or none.
 */
describe('AiTabPanel — the DOCS answer links to its document, not a chunk id', () => {
  const renderWithSuggestion = (suggestedAnswer: Record<string, unknown>) => {
    similar.mockResolvedValue({ success: true, data: [] });
    return render(
      <MemoryRouter>
        <AiTabPanel
          message={
            {
              id: nextId++,
              sender: 'a@b.example',
              channel: 'email',
              createdAt: '2026-10-15T10:00:00Z',
              metadata: { suggestedAnswer },
            } as unknown as Message
          }
          onGhostClick={() => {}}
          section="suggested"
        />
      </MemoryRouter>
    );
  };
  const base = { answer: 'Pickups run 08:00–13:00.', confidence: 0.88, source: 'documentation' };

  it('🔴 with the document id from the BE, the link highlights THAT document', async () => {
    renderWithSuggestion({ ...base, referencedChunks: [501, 502], sourceDocumentId: 7 });
    const link = await screen.findByRole('link', { name: 'View in Knowledge Base' });
    expect(link.getAttribute('href')).toBe('/knowledge-base?docId=7#documentation');
  });

  it('🔴 an older answer with chunk ids only opens Documentation without a wrong highlight', async () => {
    renderWithSuggestion({ ...base, referencedChunks: [501] });
    const link = await screen.findByRole('link', { name: 'View in Knowledge Base' });
    expect(link.getAttribute('href')).toBe('/knowledge-base#documentation');
    expect(link.getAttribute('href')).not.toContain('501');
  });
});
