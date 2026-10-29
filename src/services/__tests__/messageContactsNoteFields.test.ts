import { describe, expect, it, vi } from 'vitest';
import { messageService } from '@/services/message.service';
import { apiClient } from '@/lib/api-client';

/** Version skew: a backend without the note summary must still give every row a count of 0. */
describe('messageService.getContacts — note fields', () => {
  it('defaults the missing fields and keeps the ones sent', async () => {
    const latestNote = {
      content: 'hi',
      truncated: false,
      createdAt: '2026-10-01T00:00:00Z',
      authorFirstName: null,
      authorLastName: null,
    };
    // The list posts its filters (searchPost.ts).
    const get = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        success: true,
        data: [
          { sender: 'old@example.com' },
          { sender: 'new@example.com', noteCount: 2, latestNote },
        ],
      },
    });
    const res = await messageService.getContacts({}, 1, 50);
    expect(res.data?.[0]).toMatchObject({ noteCount: 0, latestNote: null });
    expect(res.data?.[1]).toMatchObject({ noteCount: 2, latestNote });
    get.mockRestore();
  });
});
