/**
 * The reply request carries `resendOfEventId` — and the stored-files choice `keepStoredFiles` — on
 * both paths (JSON and multipart), only when set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiClient: { post } }));

const { messageComposeApi } = await import('../messageCompose.api');

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { success: true } });
});

describe('resendOfEventId on the reply request', () => {
  it('JSON: sent with the guard', async () => {
    await messageComposeApi.reply(
      7,
      '<p>x</p>',
      false,
      false,
      undefined,
      'k1',
      undefined,
      undefined,
      undefined,
      undefined,
      { seenLastEventId: 9, resendOfEventId: 9 }
    );
    expect(post.mock.calls[0][1]).toMatchObject({ seenLastEventId: 9, resendOfEventId: 9 });
  });

  it('JSON CONTROL: absent on an ordinary reply', async () => {
    await messageComposeApi.reply(
      7,
      '<p>x</p>',
      false,
      false,
      undefined,
      'k1',
      undefined,
      undefined,
      undefined,
      undefined,
      { seenLastEventId: 9 }
    );
    expect(post.mock.calls[0][1]).not.toHaveProperty('resendOfEventId');
  });

  it('multipart: sent as a string field', async () => {
    await messageComposeApi.replyWithAttachments(
      7,
      '<p>x</p>',
      [new File(['a'], 'a.txt')],
      false,
      false,
      undefined,
      'k1',
      undefined,
      undefined,
      undefined,
      { resendOfEventId: 9 }
    );
    const form = post.mock.calls[0][1] as FormData;
    expect(form.get('resendOfEventId')).toBe('9');
  });

  it('multipart CONTROL: absent on an ordinary reply', async () => {
    await messageComposeApi.replyWithAttachments(
      7,
      '<p>x</p>',
      [new File(['a'], 'a.txt')],
      false,
      false,
      undefined,
      'k1'
    );
    expect((post.mock.calls[0][1] as FormData).has('resendOfEventId')).toBe(false);
  });
});

describe('keepStoredFiles on a resend', () => {
  const json = (collision: Record<string, unknown>) =>
    messageComposeApi.reply(
      7,
      '<p>x</p>',
      false,
      false,
      undefined,
      'k1',
      undefined,
      undefined,
      undefined,
      undefined,
      collision
    );
  const multipart = (collision: Record<string, unknown>) =>
    messageComposeApi.replyWithAttachments(
      7,
      '<p>x</p>',
      [new File(['a'], 'a.txt')],
      false,
      false,
      undefined,
      'k1',
      undefined,
      undefined,
      undefined,
      collision
    );

  it('JSON: false and true are sent as booleans', async () => {
    await json({ resendOfEventId: 9, keepStoredFiles: false });
    await json({ resendOfEventId: 9, keepStoredFiles: true });
    expect(post.mock.calls[0][1]).toMatchObject({ resendOfEventId: 9, keepStoredFiles: false });
    expect(post.mock.calls[1][1]).toMatchObject({ resendOfEventId: 9, keepStoredFiles: true });
  });

  it('JSON CONTROL: absent when not chosen, and never without a resend', async () => {
    await json({ resendOfEventId: 9 });
    await json({ seenLastEventId: 9, keepStoredFiles: false });
    expect(post.mock.calls[0][1]).not.toHaveProperty('keepStoredFiles');
    expect(post.mock.calls[1][1]).not.toHaveProperty('keepStoredFiles');
  });

  it("multipart: 'true' / 'false'", async () => {
    await multipart({ resendOfEventId: 9, keepStoredFiles: true });
    await multipart({ resendOfEventId: 9, keepStoredFiles: false });
    expect((post.mock.calls[0][1] as FormData).get('keepStoredFiles')).toBe('true');
    expect((post.mock.calls[1][1] as FormData).get('keepStoredFiles')).toBe('false');
  });

  it('multipart CONTROL: absent when not chosen', async () => {
    await multipart({ resendOfEventId: 9 });
    expect((post.mock.calls[0][1] as FormData).has('keepStoredFiles')).toBe(false);
  });
});
