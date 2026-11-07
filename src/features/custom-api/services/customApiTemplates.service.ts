import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import type { components } from '@/types/generated/api';

/** A custom API template (spec CUSTOM-API-TEMPLATES 2026-10-09). Not a reply template. */
export type CustomApiTemplate = components['schemas']['CustomApiTemplate'];
export type TemplateDefinition = CustomApiTemplate['definition'];
export type TemplateLookup = TemplateDefinition['lookups'][number];
export type TemplateChecklistItem = TemplateLookup['checklist'][number];

/**
 * C2: the ADMIN list also returns a row whose stored definition no longer parses, so it can be
 * seen and repaired. Then `definition` is the stored JSON as is (any shape) and `definitionError`
 * says what is wrong ("path: message; …"). Absent on a healthy row and from an older backend.
 * The WORKSPACE list never serves a broken row, so `CustomApiTemplate` stays strict.
 */
export type AdminCustomApiTemplate = Omit<CustomApiTemplate, 'definition'> & {
  definition: unknown;
  definitionError?: string;
};

export interface TemplateInput {
  key: string;
  name: string;
  description?: string;
  status?: 'draft' | 'published';
  definition: TemplateDefinition;
}
export type TemplatePatch = Partial<Omit<TemplateInput, 'key'>>;

const ADMIN_PATH = '/api/admin/platform/custom-api-templates';

export const customApiTemplateService = {
  /** Published templates this workspace can apply (MANAGE_INTEGRATIONS). */
  async listPublished(): Promise<CustomApiTemplate[]> {
    try {
      const res = await apiClient.get<{ success: boolean; data?: CustomApiTemplate[] }>(
        '/api/custom-apis/templates'
      );
      return res.data.data ?? [];
    } catch (err) {
      // FE deploys on merge, BE on a tag: an older backend answers 400 (":id" parser) or 404 here.
      const status = getErrorStatus(err);
      if (status === 400 || status === 404) return [];
      throw err;
    }
  },
};

export const customApiTemplateAdminService = {
  async list(): Promise<AdminCustomApiTemplate[]> {
    const res = await apiClient.get<{ success: boolean; data?: AdminCustomApiTemplate[] }>(
      ADMIN_PATH
    );
    return res.data.data ?? [];
  },
  async create(input: TemplateInput): Promise<CustomApiTemplate> {
    const res = await apiClient.post<{ success: boolean; data: CustomApiTemplate }>(
      ADMIN_PATH,
      input
    );
    return res.data.data;
  },
  /** C3: a status-only PATCH on a broken row answers with the admin view (with `definitionError`). */
  async update(id: number, patch: TemplatePatch): Promise<AdminCustomApiTemplate> {
    const res = await apiClient.patch<{ success: boolean; data: AdminCustomApiTemplate }>(
      `${ADMIN_PATH}/${id}`,
      patch
    );
    return res.data.data;
  },
};
