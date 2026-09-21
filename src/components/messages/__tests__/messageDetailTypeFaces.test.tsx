/**
 * Grotesk for labels, Sans for language, Mono for identifiers (docs/UI_CONVENTIONS.md).
 *
 * The shared label constant was called MONO and set no face at all, so every tab name, chip
 * label and field label on message detail rendered in body Sans while reading, in the source,
 * as though it were settled. These assert the face on the class string, which is all jsdom
 * can see — whether Space Grotesk actually paints is a browser check, not this one.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { LABEL, CHIP_BASE } from '../messageDetailConstants';
import { ThreadMessageItem } from '../ThreadMessageItem';

vi.mock('@/hooks/useMessageHtml', () => ({
  useMessageHtml: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/components/shared/TranslateButton', () => ({
  TranslateButton: () => null,
}));

afterEach(cleanup);

const classes = (value: string) => value.split(/\s+/);

describe('message detail — type faces', () => {
  it('sets labels and chips in the label face, never mono', () => {
    for (const cls of [LABEL, CHIP_BASE]) {
      expect(classes(cls)).toContain('font-display');
      expect(classes(cls)).not.toContain('font-mono');
    }
  });

  it('names the agent in the label face and keeps the mailbox address in mono', () => {
    const msg = {
      id: 1,
      conversationId: 10,
      type: 'agent_reply',
      content: 'hello',
      authorId: 7,
      authorEmail: 'info@coresarms.co.uk',
      authorName: 'Mia Taco',
      authorUserEmail: 'mia@coresarms.co.uk',
      channel: 'email',
      sentAt: '2026-08-18T17:50:00Z',
      createdAt: '2026-08-18T17:50:00Z',
      metadata: null,
      recipients: null,
    } as unknown as MessageEvent;
    render(<ThreadMessageItem msg={msg} />);
    const name = screen.getByText('Mia Taco');
    expect(classes(name.className)).toContain('font-display');
    // The address is an identifier: it inherits mono from the row, and must not be pulled
    // into the label face along with the name.
    const via = screen.getByText(/via info@coresarms\.co\.uk/);
    expect(classes(via.className)).not.toContain('font-display');
    expect(via.closest('.font-mono')).not.toBeNull();
  });
});
