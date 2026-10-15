import { describe, it, expect, vi, beforeEach } from 'vitest';

const patch = vi.hoisted(() => ({ calls: [] as unknown[][], reply: {} as unknown }));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    patch: (...args: unknown[]) => {
      patch.calls.push(args);
      return Promise.resolve({ data: patch.reply });
    },
  },
}));

const { messageService } = await import('../message.service');

beforeEach(() => {
  patch.calls = [];
});

describe('manualRoute (audit B4: the FE never sends learn)', () => {
  it('sends exactly { departmentId }', async () => {
    patch.reply = { success: true, data: { learningRecorded: true } };
    await messageService.manualRoute(7, 3);
    expect(patch.calls).toEqual([['/api/messages/7/manual-route', { departmentId: 3 }]]);
    expect(Object.keys(patch.calls[0][1] as object)).not.toContain('learn');
  });

  it('reads learningRecorded, and an older backend (no data) as false', async () => {
    patch.reply = { success: true, data: { learningRecorded: true } };
    expect(await messageService.manualRoute(7, 3)).toEqual({ learningRecorded: true });
    patch.reply = { success: true };
    expect(await messageService.manualRoute(7, 3)).toEqual({ learningRecorded: false });
  });
});
