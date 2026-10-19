import { vi, describe, it, expect, beforeEach } from 'vitest';

const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args) },
}));

import { messageService } from '@/services/message.service';

const sentTo = () => (post.mock.calls[0][1] as FormData).get('to');
const base = { messageSourceId: 3, subject: 'Hello', content: '<p>Hi</p>' };

// The app can be deployed before the backend that takes a To list. One address is the common case
// and must keep working on that backend, which accepts only a plain string.
describe('messageService.composeNew — To on the wire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: { success: true } });
  });

  it('one address goes as a plain string (any backend accepts it)', async () => {
    await messageService.composeNew({ ...base, to: ['solo@example.com'] });
    expect(sentTo()).toBe('solo@example.com');
  });

  it('several go JSON-encoded, like cc/bcc', async () => {
    await messageService.composeNew({ ...base, to: ['a@example.com', 'b@example.com'] });
    expect(sentTo()).toBe('["a@example.com","b@example.com"]');
  });
});
