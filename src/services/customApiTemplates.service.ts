import { apiClient } from '@/lib/api-client';
import type { components } from '@/types/generated/api';

/** A custom API template (spec CUSTOM-API-TEMPLATES 2026-10-09). Not a reply template. */
export type CustomApiTemplate = components['schemas']['CustomApiTemplate'];
export type TemplateDefinition = CustomApiTemplate['definition'];
export type TemplateLookup = TemplateDefinition['lookups'][number];
export type TemplateChecklistItem = TemplateLookup['checklist'][number];

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
    const res = await apiClient.get<{ success: boolean; data?: CustomApiTemplate[] }>(
      '/api/custom-apis/templates'
    );
    return res.data.data ?? [];
  },
};

export const customApiTemplateAdminService = {
  async list(): Promise<CustomApiTemplate[]> {
    const res = await apiClient.get<{ success: boolean; data?: CustomApiTemplate[] }>(ADMIN_PATH);
    return res.data.data ?? [];
  },
  async create(input: TemplateInput): Promise<CustomApiTemplate> {
    const res = await apiClient.post<{ success: boolean; data: CustomApiTemplate }>(
      ADMIN_PATH,
      input
    );
    return res.data.data;
  },
  async update(id: number, patch: TemplatePatch): Promise<CustomApiTemplate> {
    const res = await apiClient.patch<{ success: boolean; data: CustomApiTemplate }>(
      `${ADMIN_PATH}/${id}`,
      patch
    );
    return res.data.data;
  },
};
