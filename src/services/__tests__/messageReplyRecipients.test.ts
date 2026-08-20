import { vi, describe, it, expect, beforeEach } from 'vitest';

const post = vi.fn<(...args: unknown[]) => Promise<{ data: { success: true } }>>();

vi.mock('@/lib/api-client', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));

import { messageService } from '@/services/message.service';

/**
 * An absent `to` is what tells the backend "the requester, nobody else". Sending
 * `[]` would be a different statement, and sending the customer's original Cc
 * list by default would turn every reply into a reply-all — on a shared support
 * inbox that discloses the thread to whoever happened to be copied.
 */
describe('messageService reply — recipients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: { success: true } });
  });

  it('omits to/cc/bcc entirely when the agent addressed nothing', async () => {
    await messageService.reply(42, '<p>hi</p>', false, false, undefined, 'key-1');
    const body = post.mock.calls[0][1];
    expect(body).not.toHaveProperty('to');
    expect(body).not.toHaveProperty('cc');
    expect(body).not.toHaveProperty('bcc');
  });

  it('omits a field whose list is empty rather than sending []', async () => {
    await messageService.reply(42, '<p>hi</p>', false, false, undefined, 'key-2', undefined, undefined, {
      to: ['someone@acme.com'],
      cc: [],
      bcc: [],
    });
    const body = post.mock.calls[0][1];
    expect(body).toMatchObject({ to: ['someone@acme.com'] });
    expect(body).not.toHaveProperty('cc');
    expect(body).not.toHaveProperty('bcc');
  });

  it('sends every list the agent filled in', async () => {
    await messageService.reply(42, '<p>hi</p>', false, false, undefined, 'key-3', undefined, undefined, {
      to: ['a@acme.com', 'b@acme.com'],
      cc: ['c@acme.com'],
      bcc: ['audit@acme.com'],
    });
    expect(post.mock.calls[0][1]).toMatchObject({
      to: ['a@acme.com', 'b@acme.com'],
      cc: ['c@acme.com'],
      bcc: ['audit@acme.com'],
    });
  });

  it('JSON-encodes the lists on the multipart path', async () => {
    // multipart has no array type: repeating the field would hand the backend a
    // bare string for one address and an array for two, a shape that changes
    // with the input.
    await messageService.replyWithAttachments(
      42,
      '<p>hi</p>',
      [new File(['x'], 'a.txt')],
      false,
      false,
      undefined,
      'key-4',
      undefined,
      { to: ['a@acme.com'], cc: ['c@acme.com'] }
    );
    const form = post.mock.calls[0][1] as FormData;
    expect(form.get('to')).toBe(JSON.stringify(['a@acme.com']));
    expect(form.get('cc')).toBe(JSON.stringify(['c@acme.com']));
    expect(form.get('bcc')).toBeNull();
  });
});
