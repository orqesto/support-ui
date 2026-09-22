/**
 * The request the bin action sends.
 *
 * ⛔ The `disposition` string is the entire feature on the wire. The backend answers 400 on an
 * unknown value rather than closing the thread as an ordinary resolution — deliberately, so a
 * typo cannot silently inflate the resolved statistics — which means a typo HERE is a broken
 * button, not a silent corruption. Pinned so a rename has to change both sides.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn<(url: string, body?: unknown) => Promise<unknown>>(() =>
  Promise.resolve({ data: { success: true, data: {} } })
);
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (url: string, body?: unknown) => post(url, body) },
}));

const { messageService } = await import('../message.service');

beforeEach(() => post.mockClear());

describe('markAsNotCustomerWork', () => {
  it('posts the disposition to the process endpoint', async () => {
    await messageService.markAsNotCustomerWork(11, 'newsletter');

    expect(post).toHaveBeenCalledWith('/api/messages/11/process', {
      disposition: 'not_customer_work',
      dispositionReason: 'newsletter',
    });
  });

  it('omits the reason entirely when the agent typed nothing', async () => {
    // The backend stores null rather than inventing a reason; sending an empty string would
    // record a blank quotation on the thread instead.
    await messageService.markAsNotCustomerWork(11, '   ');

    expect(post).toHaveBeenCalledWith('/api/messages/11/process', {
      disposition: 'not_customer_work',
    });
  });

  it('CONTROL: the ordinary resolve still sends NO disposition', async () => {
    // Without this, a change that stamped every close would pass the assertions above while
    // emptying the resolved statistics.
    await messageService.markAsProcessed(11);

    expect(post).toHaveBeenCalledWith('/api/messages/11/process', {});
  });
});
