import { vi, describe, it, expect, beforeEach } from 'vitest';

const post = vi.fn<(...args: unknown[]) => Promise<{ data: { success: true } }>>();

vi.mock('@/lib/api-client', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));

import { messageService } from '@/services/message.service';

/**
 * "Send, resolve & save to KB" sent `resolve` alone until 2026-11-20, and the server reads that as
 * "resolve": nothing was saved for review (two workspaces reported it). The option now says
 * so in its own field, on both the JSON and the attachment request.
 */
describe('messageService reply — saveToKb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: { success: true } });
  });

  const args = [false, undefined, 'key', undefined] as const;

  it('JSON reply: sends saveToKb with resolve when asked', async () => {
    await messageService.reply(
      42,
      '<p>hi</p>',
      true,
      ...args,
      undefined,
      undefined,
      undefined,
      undefined,
      true
    );
    expect(post.mock.calls[0][1]).toMatchObject({ resolve: true, saveToKb: true });
  });

  it('control: a reply that only resolves, or does not resolve, carries no saveToKb', async () => {
    await messageService.reply(42, '<p>hi</p>', true, ...args);
    await messageService.reply(42, '<p>hi</p>', false, ...args);
    expect(post.mock.calls[0][1]).not.toHaveProperty('saveToKb');
    expect(post.mock.calls[1][1]).not.toHaveProperty('saveToKb');
  });

  it('attachment reply: the form carries saveToKb when asked, and not otherwise', async () => {
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    await messageService.replyWithAttachments(
      42,
      '<p>hi</p>',
      [file],
      true,
      ...args,
      undefined,
      undefined,
      undefined,
      true
    );
    await messageService.replyWithAttachments(42, '<p>hi</p>', [file], true, ...args);
    const asked = post.mock.calls[0][1] as FormData;
    const plain = post.mock.calls[1][1] as FormData;
    expect(asked.get('saveToKb')).toBe('true');
    expect(asked.get('resolve')).toBe('true');
    expect(plain.has('saveToKb')).toBe(false);
  });
});
