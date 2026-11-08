/**
 * `getMessageHeaders` — the admin "Headers" dialog's read of
 * `GET /api/messages/events/:id/headers`, normalised so a partial or older body never breaks it.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, post: vi.fn(), delete: vi.fn() } }));

const { getMessageHeaders } = await import('../message-html.service');

beforeEach(() => {
  get.mockReset();
});

describe('getMessageHeaders', () => {
  it('asks for the event and returns its headers in order', async () => {
    get.mockResolvedValue({
      data: {
        data: {
          source: 'imap',
          headers: [
            { name: 'Received', value: 'from relay.example.test' },
            { name: 'Precedence', value: 'bulk' },
          ],
          truncated: true,
        },
      },
    });
    await expect(getMessageHeaders(9)).resolves.toEqual({
      source: 'imap',
      headers: [
        { name: 'Received', value: 'from relay.example.test' },
        { name: 'Precedence', value: 'bulk' },
      ],
      truncated: true,
    });
    expect(get).toHaveBeenCalledWith('/api/messages/events/9/headers');
  });

  it('drops malformed entries and an unknown source instead of breaking the list', async () => {
    get.mockResolvedValue({
      data: {
        data: {
          source: 'pop3',
          headers: [{ name: 'X-Ok', value: 'yes' }, null, { name: 3 }, { value: 'orphan' }],
        },
      },
    });
    await expect(getMessageHeaders(9)).resolves.toEqual({
      source: null,
      headers: [{ name: 'X-Ok', value: 'yes' }],
      truncated: false,
    });
  });

  it('an empty body reads as no headers', async () => {
    get.mockResolvedValue({ data: { data: null } });
    await expect(getMessageHeaders(9)).resolves.toEqual({
      source: null,
      headers: [],
      truncated: false,
    });
  });
});
