/**
 * Regression: translating a message must actually change what is rendered.
 *
 * `useMessageHtml` is a react-query hook keyed on `eventId`, `staleTime: Infinity`. Once an
 * inbound message's original HTML has been fetched, disabling the query (which is what
 * happens once a translation exists — `wantsHtml` goes false) does NOT clear its cached
 * `data`; react-query just stops refetching it. `ThreadBubble` always prefers `html` over
 * `content` when `html` is present, so without gating what gets passed down, the bubble kept
 * rendering the stale original markup after a translation resolved — the translate call
 * succeeded and `hasTranslation` flipped true, but nothing on screen changed.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { ThreadMessageItem } from '../ThreadMessageItem';

const ORIGINAL_HTML = '<table><tr><td>Discount:</td><td>-£16.50</td></tr></table>';
const TRANSLATED_TEXT = 'Descuento: -16.50';

// Simulates real react-query behaviour: cached `data` for the queryKey survives `enabled`
// flipping to false, so this mock ignores the `enabled` argument entirely, same as the cache
// would once it has already fetched once.
vi.mock('@/hooks/useMessageHtml', () => ({
  useMessageHtml: () => ({ data: ORIGINAL_HTML, isLoading: false }),
}));

vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: ({ onTranslated }: { onTranslated: (content: string) => void }) => (
    <button onClick={() => onTranslated(TRANSLATED_TEXT)}>mock-translate</button>
  ),
}));

afterEach(cleanup);

const inboundMsg: MessageEvent = {
  id: 2482,
  conversationId: 8435,
  type: 'inbound',
  content: '| Discount: | -16.50 |',
  authorId: null,
  authorEmail: 'customer@example.test',
  authorName: null,
  authorUserEmail: null,
  channel: 'email',
  sentAt: '2026-08-25T15:51:25Z',
  createdAt: '2026-08-26T05:27:18Z',
  metadata: null,
  recipients: null,
} as unknown as MessageEvent;

describe('ThreadMessageItem — translating an inbound HTML message', () => {
  it('shows the translated text, not the stale original HTML, once translation resolves', () => {
    render(<ThreadMessageItem msg={inboundMsg} />);

    // Before translating: original HTML renders, as intended (#305).
    expect(screen.getByRole('table')).toBeTruthy();

    fireEvent.click(screen.getByText('mock-translate'));

    // After translating: the translated text must be what's on screen —
    // the stale cached original HTML must not win the render.
    expect(screen.getByText(TRANSLATED_TEXT)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/Discount/)).toBeNull();
  });
});
