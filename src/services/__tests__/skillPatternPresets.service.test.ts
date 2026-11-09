import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const put = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
  },
}));

import { skillPatternPresetsService } from '@/services/skillPatternPresets.service';

const reply = (data: unknown) => ({ data: { success: true, data } });
const ROW = {
  id: 'order_number',
  label: 'Order number',
  example: 'ORD-123456',
  category: 'shop',
  regex: 'ORD-\\d{6}',
  caseSensitive: false,
  enabled: true,
};

/** Console → the skill pattern catalogue (BE 2026-11-09, global admin). */
describe('skillPatternPresetsService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads { presets, isDefault }; an older backend (404) reads as null', async () => {
    get.mockResolvedValueOnce(reply({ presets: [ROW, { id: 'broken' }], isDefault: true }));
    await expect(skillPatternPresetsService.get()).resolves.toEqual({
      presets: [ROW],
      isDefault: true,
    });
    expect(get).toHaveBeenCalledWith('/api/admin/platform/skill-pattern-presets');
    get.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404, data: {} }));
    await expect(skillPatternPresetsService.get()).resolves.toBeNull();
  });

  it('saves { presets } with an empty example left out; accepts a bare saved list back', async () => {
    put.mockResolvedValueOnce(reply([{ ...ROW, example: undefined }]));
    const saved = await skillPatternPresetsService.save([{ ...ROW, example: '  ' }]);
    const { example: _dropped, ...withoutExample } = ROW;
    expect(put).toHaveBeenCalledWith('/api/admin/platform/skill-pattern-presets', {
      presets: [withoutExample],
    });
    expect(saved).toEqual({ presets: [withoutExample], isDefault: false });
  });
});
