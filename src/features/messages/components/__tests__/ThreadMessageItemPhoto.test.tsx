/**
 * A reply a teammate sent shows their profile photo in the thread's avatar circle. Nothing a
 * customer wrote ever shows a teammate's photo.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { userPhotoUrl } from '@/components/ui/UserPhoto';
import { ThreadMessageItem } from '../ThreadMessageItem';

vi.mock('@/features/messages/hooks/useMessageHtml', () => ({
  useMessageHtml: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));

afterEach(cleanup);

const event = (over: Partial<MessageEvent>): MessageEvent =>
  ({
    id: 1,
    conversationId: 10,
    type: 'agent_reply',
    content: 'It ships today.',
    authorId: 7,
    authorEmail: 'support@shop.example',
    authorName: 'Mia Petro',
    authorUserEmail: 'mia@shop.example',
    authorPhotoKey: 'k-mia',
    channel: 'email',
    sentAt: '2026-08-18T17:50:00Z',
    createdAt: '2026-08-18T17:50:00Z',
    metadata: null,
    recipients: null,
    ...over,
  }) as unknown as MessageEvent;

describe('ThreadMessageItem — teammate photo', () => {
  it('shows the sending teammate’s photo on their reply', () => {
    render(<ThreadMessageItem msg={event({})} />);
    expect(document.querySelector('img[src]')?.getAttribute('src')).toBe(userPhotoUrl('k-mia'));
  });

  it('control: a reply without a key keeps the initials', () => {
    render(<ThreadMessageItem msg={event({ authorPhotoKey: null })} />);
    expect(document.querySelector(`img[src="${userPhotoUrl('k-mia')}"]`)).toBeNull();
  });

  it('a customer message never shows a teammate photo, even if a key were present', () => {
    render(
      <ThreadMessageItem
        msg={event({ type: 'inbound', authorEmail: 'anna@customer.example', authorName: null })}
      />
    );
    expect(document.querySelector(`img[src="${userPhotoUrl('k-mia')}"]`)).toBeNull();
  });
});
