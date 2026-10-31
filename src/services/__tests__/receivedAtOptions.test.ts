import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));

import { messageService } from '@/services/message.service';
import { ReceivedAtOptionsError, describeReceivedAt } from '@/services/receivedAtOption';

/**
 * The alias list that populates the "Received at" filter.
 *
 * The frontend deploys on merge while the backend ships on its own cadence, so this
 * route 404s in production during that window. While it does, the filter must simply
 * not offer itself — an unhandled rejection here would take the whole filters bar down.
 *
 * It now asks for `detailed=1`, which an older backend IGNORES, answering with the plain
 * `string[]` it always did. Both shapes therefore reach production at the same time, and
 * both have to work — that is what most of this file is about.
 */
describe('messageService.getReceivedAtOptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the detailed shape when the backend supports it', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { address: 'info@acme.com', ours: true, conversations: 257, deliveredConversations: 257 },
          { address: 'zoe@customer.com', ours: false, conversations: 2, deliveredConversations: 0 },
        ],
      },
    });
    await expect(messageService.getReceivedAtOptions()).resolves.toEqual([
      { address: 'info@acme.com', ours: true, conversations: 257, deliveredConversations: 257 },
      { address: 'zoe@customer.com', ours: false, conversations: 2, deliveredConversations: 0 },
    ]);
  });

  it('still works against a backend that answers the old string[]', async () => {
    // Not hypothetical: the FE ships on merge, the BE on a tag. This is the live shape
    // until that tag goes out, and it must render a plain list rather than nothing.
    get.mockResolvedValue({ data: { success: true, data: ['info@acme.com', 'sales@acme.com'] } });
    await expect(messageService.getReceivedAtOptions()).resolves.toEqual([
      { address: 'info@acme.com', ours: false, conversations: 0, deliveredConversations: 0 },
      { address: 'sales@acme.com', ours: false, conversations: 0, deliveredConversations: 0 },
    ]);
  });

  it('drops a row with no usable address instead of rendering a blank line', async () => {
    get.mockResolvedValue({
      data: { success: true, data: [{ address: '', ours: true }, { ours: true }, 'ok@acme.com'] },
    });
    const rows = await messageService.getReceivedAtOptions();
    expect(rows.map((row) => row.address)).toEqual(['ok@acme.com']);
  });

  it('returns [] when the endpoint is not deployed yet', async () => {
    get.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(messageService.getReceivedAtOptions()).resolves.toEqual([]);
  });

  // The api-client rejects with `status` and the response body as `data`.
  const refused = (status: number, data?: unknown) =>
    Object.assign(new Error('refused'), { status, data });

  it('a read the backend stopped (503 timedOut) rejects as timed out — not an empty list', async () => {
    get.mockRejectedValue(refused(503, { success: false, timedOut: true }));
    const read = messageService.getReceivedAtOptions();
    await expect(read).rejects.toBeInstanceOf(ReceivedAtOptionsError);
    await expect(read).rejects.toMatchObject({ timedOut: true });
  });

  it('any other failure rejects too, not timed out (an older backend never sends 503)', async () => {
    get.mockRejectedValue(refused(500, { success: false }));
    await expect(messageService.getReceivedAtOptions()).rejects.toMatchObject({ timedOut: false });
    get.mockRejectedValue(new Error('Network Error'));
    await expect(messageService.getReceivedAtOptions()).rejects.toMatchObject({ timedOut: false });
  });

  it('a refused permission is "not offered": []', async () => {
    get.mockRejectedValue(refused(403));
    await expect(messageService.getReceivedAtOptions()).resolves.toEqual([]);
  });

  it('returns [] rather than undefined when the payload has no data', async () => {
    // The filter checks `.length`; undefined would throw at the render site.
    get.mockResolvedValue({ data: { success: true } });
    await expect(messageService.getReceivedAtOptions()).resolves.toEqual([]);
  });
});

/**
 * The trailing detail on an option. `deliveredConversations` answers a different
 * question from the total: non-zero means our own receiving server recorded that
 * address accepting the mail, which a sender cannot influence. An address with volume
 * and no deliveries is a correspondent; one with deliveries is a mailbox of ours.
 */
describe('describeReceivedAt', () => {
  it('marks an address our own server recorded taking delivery', () => {
    // Not the word "delivered": the filter itself is labelled "Delivered to", so a row
    // WITHOUT the mark would read as a bug rather than as the weaker signal it is.
    expect(
      describeReceivedAt({
        address: 'info@acme.com',
        ours: true,
        conversations: 257,
        deliveredConversations: 257,
      })
    ).toBe('257 · confirmed');
  });

  it('shows volume alone when the address was only ever named in To/Cc', () => {
    expect(
      describeReceivedAt({
        address: 'zoe@customer.com',
        ours: false,
        conversations: 2,
        deliveredConversations: 0,
      })
    ).toBe('2');
  });

  it('says nothing at all against a backend that reports no counts', () => {
    // Otherwise every address on an older deploy reads "0", which is a claim about the
    // mailbox rather than about what we know.
    expect(
      describeReceivedAt({
        address: 'info@acme.com',
        ours: false,
        conversations: 0,
        deliveredConversations: 0,
      })
    ).toBeUndefined();
  });
});
