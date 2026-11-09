import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import { normalizeCatalogue } from '@/services/skillPatterns';
import type { ApiResponse } from '@/types';
import type {
  PlatformSkillPatternCatalogue,
  PlatformSkillPatternPreset,
} from '@/types/skillRouting';

const BASE = '/api/admin/platform/skill-pattern-presets';

/**
 * Console → Platform defaults → the skill routing preset catalogue (global admin, BE 2026-11-09).
 * The backend checks every regex (shape, safety, compile time) and refuses a bad list with a
 * reason in `message` or `error` — the caller shows it.
 */
export const skillPatternPresetsService = {
  /** null on a backend that predates the catalogue (404) — the card then says so. */
  get: async (): Promise<PlatformSkillPatternCatalogue | null> => {
    try {
      const response = await apiClient.get<ApiResponse<unknown>>(BASE);
      return normalizeCatalogue(response.data.data);
    } catch (error) {
      if (getErrorStatus(error) === 404) return null;
      throw error;
    }
  },

  /** Replace the catalogue; resolves with the saved list as the backend now serves it. */
  save: async (
    presets: PlatformSkillPatternPreset[]
  ): Promise<PlatformSkillPatternCatalogue | null> => {
    const body = presets.map(({ example, ...rest }) => ({
      ...rest,
      ...(example?.trim() ? { example: example.trim() } : {}),
    }));
    const response = await apiClient.put<ApiResponse<unknown>>(BASE, { presets: body });
    return normalizeCatalogue(response.data.data);
  },
};
