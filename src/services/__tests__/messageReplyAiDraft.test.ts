import { vi, describe, it, expect, beforeEach } from 'vitest';

const post = vi.fn<(...args: unknown[]) => Promise<{ data: { success: true } }>>();

vi.mock('@/lib/api-client', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));

import { messageService } from '@/services/message.service';

// The AI draft the agent started from is what makes reply_style learnable: the
// backend diffs it against the sent body to see what the agent CHANGED. If the
// send drops it, the domain records nothing and the nightly proposer never fires.
describe('messageService reply — reply_style draft capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: { success: true } });
  });

  it('sends the draft on the JSON path', async () => {
    await messageService.reply(42, '<p>sent</p>', false, true, 'ai_compose_polish', 'key-1', {
      text: '<p>draft</p>',
      mode: 'polish',
      language: 'de',
    });

    expect(post.mock.calls[0][1]).toMatchObject({
      content: '<p>sent</p>',
      aiDraft: { text: '<p>draft</p>', mode: 'polish', language: 'de' },
    });
  });

  it('omits the field entirely when the agent wrote the reply themselves', async () => {
    await messageService.reply(42, '<p>mine</p>', false, false, undefined, 'key-2');
    expect(post.mock.calls[0][1]).not.toHaveProperty('aiDraft');
  });

  it('serializes the draft as JSON on the attachment path, which is multipart', async () => {
    await messageService.replyWithAttachments(
      42,
      '<p>sent</p>',
      [new File(['x'], 'a.txt')],
      false,
      true,
      'ai_compose_generate',
      'key-3',
      { text: '<p>draft</p>', mode: 'generate' }
    );

    const formData = post.mock.calls[0][1] as FormData;
    expect(JSON.parse(formData.get('aiDraft') as string)).toEqual({
      text: '<p>draft</p>',
      mode: 'generate',
    });
  });

  it('leaves the multipart field out when there was no draft', async () => {
    await messageService.replyWithAttachments(42, '<p>mine</p>', [new File(['x'], 'a.txt')]);
    expect((post.mock.calls[0][1] as FormData).get('aiDraft')).toBeNull();
  });
});
