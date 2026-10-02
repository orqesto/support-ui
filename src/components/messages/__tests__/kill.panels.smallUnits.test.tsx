import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message, MessageEvent } from '@/types';
import type { MessageNote } from '@/services/message.service';
import type { LookupField } from '@/services/customApiLookup.service';
import { CustomApiRecordInsert } from '../CustomApiRecordInsert';
import { CustomerSenderBlock, ConversationFacts } from '../CustomerTabPanels';
import { appendReplyParagraph, replyHasSentence } from '../customApiRecordNote';
import { channelInSentence, channelName } from '../messageDetailConstants';
import { ThreadMessageItem } from '../ThreadMessageItem';
import { ThreadNoteItem } from '../ThreadNoteItem';
import { parseSender } from '@/lib/messageHelpers';

/**
 * Small user-read details across the message panels: the record-insert hint, preview box and
 * warning; the Customer tab's second line and fact rows; the reply sentence's escaping and
 * duplicate detection; parseSender's quote handling; the phone thread row/bubble classes; and the
 * proper-noun channel in a sentence.
 */

vi.mock('@/hooks/useMessageHtml', () => ({
  useMessageHtml: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));

afterEach(cleanup);

const field = (over: { path: string; label: string; role?: string }) =>
  ({ kind: 'plain', ...over }) as LookupField;

const FIELDS = [
  field({ path: 'order_id', label: 'Order', role: 'identifier' }),
  field({ path: 'status', label: 'Status', role: 'status' }),
];
const ROW = { order_id: '137416', status: 'shipped' };

const renderInsert = (onUseInReply = vi.fn().mockReturnValue('added')) => {
  render(
    <CustomApiRecordInsert
      row={ROW}
      fields={FIELDS}
      category="order"
      lookupLabel="Their records"
      onUseInReply={onUseInReply}
    />
  );
  return onUseInReply;
};

describe('CustomApiRecordInsert — the open panel', () => {
  it('says the sentence goes into the note for the AI draft (default target)', async () => {
    const user = userEvent.setup();
    renderInsert();
    await user.click(screen.getByRole('button', { name: /Use in reply/i }));
    expect(
      screen.getByText(
        'Adds these to your note for the AI draft — you still write and edit the reply.'
      )
    ).toBeTruthy();
  });

  it('the exact sentence sits in its box; with every box unticked no empty box remains', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CustomApiRecordInsert
        row={ROW}
        fields={FIELDS}
        category="order"
        lookupLabel="Their records"
        onUseInReply={() => 'added'}
      />
    );
    await user.click(screen.getByRole('button', { name: /Use in reply/i }));
    const box = container.querySelector('p.border-hair') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('137416');
    for (const checkbox of screen.getAllByRole('checkbox')) {
      if ((checkbox as HTMLInputElement).checked) await user.click(checkbox);
    }
    expect(container.querySelector('p.border-hair')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to my note' })).toBeDisabled();
  });

  it('"Post or clear your internal note first" shows only for that outcome', async () => {
    const user = userEvent.setup();
    const onUseInReply = vi
      .fn()
      .mockReturnValueOnce('added')
      .mockReturnValueOnce('note_in_progress');
    renderInsert(onUseInReply);
    await user.click(screen.getByRole('button', { name: /Use in reply/i }));
    expect(screen.queryByText('Post or clear your internal note first')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add to my note' }));
    expect(screen.getByText('Added to your note')).toBeTruthy();
    expect(screen.queryByText('Post or clear your internal note first')).toBeNull();
    // CONTROL: the outcome it is for does show it.
    await user.click(screen.getByRole('button', { name: 'Add to my note' }));
    expect(screen.getByText('Post or clear your internal note first')).toBeTruthy();
  });
});

const message = (over: Record<string, unknown>) =>
  ({
    id: 1,
    sender: 'a@b.example',
    channel: 'email',
    createdAt: '2026-09-22T10:00:00Z',
    metadata: null,
    ...over,
  }) as unknown as Message;

describe('Customer tab blocks', () => {
  it('a named chat sender reads "address · Channel" on the second line', () => {
    render(
      <CustomerSenderBlock message={message({ sender: 'Ada <a@b.example>', channel: 'chat' })} />
    );
    const block = screen.getByTestId('customer-sender');
    expect(block.querySelector('span')?.textContent).toBe(`a@b.example · ${channelName('chat')}`);
  });

  it('unassigned, no priority: the facts are exactly Channel / Received / Thread', () => {
    const { container } = render(<ConversationFacts message={message({})} sortedThread={[]} />);
    expect(Array.from(container.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual([
      'Channel',
      'Received',
      'Thread',
    ]);
  });

  it('CONTROL: assignee and priority add their rows', () => {
    const { container } = render(
      <ConversationFacts
        message={message({ assigneeName: 'Mia', priority: 'high' })}
        sortedThread={[]}
      />
    );
    expect(Array.from(container.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual([
      'Channel',
      'Received',
      'Thread',
      'Assigned',
      'Priority',
    ]);
  });
});

describe('the record sentence in the reply', () => {
  it("an apostrophe in a vendor value is escaped, not dropped (O'Brien)", () => {
    expect(appendReplyParagraph('', "Name: O'Brien")).toBe('<p>Name: O&#39;Brien</p>');
  });

  it('mid-word markup WITH attributes is still the same sentence', () => {
    const sentence = 'Order 123. Status: shipped.';
    expect(
      replyHasSentence('<p>Order 12<span class="hl">3</span>. Status: shipped.</p>', sentence)
    ).toBe(true);
    expect(
      replyHasSentence(
        '<p>Order 12<span style="color: red">3</span>. Status: shipped.</p>',
        sentence
      )
    ).toBe(true);
  });
});

describe('parseSender — the header quotes only', () => {
  it('a quoted name that is the address plus an edge space is no name', () => {
    expect(parseSender('"a@x.com " <a@x.com>')).toEqual({ name: null, address: 'a@x.com' });
  });

  it('quotes inside a display name survive; only the outer ones go', () => {
    expect(parseSender('Ada "Ace" Lovelace <a@x.com>')).toEqual({
      name: 'Ada "Ace" Lovelace',
      address: 'a@x.com',
    });
    expect(parseSender('"Ada "Ace" Lovelace" <a@x.com>').name).toBe('Ada "Ace" Lovelace');
  });
});

describe('phone thread classes', () => {
  it('an agent reply row is reversed and drops to a block on a phone', () => {
    const { container } = render(
      <ThreadMessageItem
        msg={
          {
            id: 1,
            conversationId: 10,
            type: 'agent_reply',
            content: 'Done',
            authorEmail: 'info@shop.example',
            authorName: 'Mia',
            channel: 'email',
            sentAt: '2026-08-18T17:50:00Z',
            createdAt: '2026-08-18T17:50:00Z',
            metadata: null,
            recipients: null,
          } as unknown as MessageEvent
        }
      />
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['flex', 'flex-row-reverse', 'max-sm:block'])
    );
  });

  it('a note bubble keeps the warning look, pre-wrap and the phone bubble size', () => {
    render(
      <ThreadNoteItem
        note={
          {
            id: 3,
            content: 'Called them back',
            authorName: 'Mia',
            createdAt: '2026-08-18T17:50:00Z',
          } as unknown as MessageNote
        }
      />
    );
    const bubble = screen.getByText('Called them back');
    expect(bubble.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        'bg-warning-muted',
        'border-warning-line',
        'whitespace-pre-wrap',
        'break-words',
        'max-sm:text-[14px]',
      ])
    );
  });
});

describe('channelInSentence', () => {
  it('Slack is a proper noun in a sentence; email is not', () => {
    expect(channelInSentence('slack')).toBe('Slack');
    expect(channelInSentence('email')).toBe('email');
  });
});
