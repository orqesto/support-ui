import { apiClient } from '@/lib/api-client';
import type { Department } from '@/types';

export type { Department };

/** Derive a BE-valid slug (`^[a-z0-9_-]+$`) from a display name. */
export const slugifyDepartmentName = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'department';

export const departmentService = {
  /** Active departments by default; pass true to include soft-deleted ones (for restore UIs). */
  getAll: async (includeInactive = false): Promise<Department[]> => {
    const response = await apiClient.get<{ success: boolean; data: Department[] }>(
      `/api/departments${includeInactive ? '?includeInactive=true' : ''}`
    );
    return response.data.data;
  },

  /** Create a new department. Slug is derived from the name unless provided. */
  create: async (input: {
    name: string;
    slug?: string;
    description?: string;
    color?: string;
  }): Promise<Department> => {
    const response = await apiClient.post<{ success: boolean; data: Department }>('/api/departments', {
      name: input.name,
      slug: input.slug ?? slugifyDepartmentName(input.name),
      ...(input.description ? { description: input.description } : {}),
      ...(input.color ? { color: input.color } : {}),
    });
    return response.data.data;
  },

  /** Rename / recolor a department. */
  update: async (
    id: number,
    patch: { name?: string; description?: string; color?: string }
  ): Promise<Department> => {
    const response = await apiClient.patch<{ success: boolean; data: Department }>(
      `/api/departments/${id}`,
      patch
    );
    return response.data.data;
  },

  /**
   * Promote a department to the org-level default (fallback). The BE clears the previous
   * default in the same transaction, so exactly one department stays default per org.
   */
  setDefault: async (id: number): Promise<Department> => {
    const response = await apiClient.patch<{ success: boolean; data: Department }>(
      `/api/departments/${id}`,
      { isDefault: true }
    );
    return response.data.data;
  },

  /** Soft-delete (BE sets active=false); the department disappears from getAll(). */
  deactivate: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/departments/${id}`);
  },

  /** Restore a soft-deleted department (active=true). */
  reactivate: async (id: number): Promise<Department> => {
    const response = await apiClient.patch<{ success: boolean; data: Department }>(
      `/api/departments/${id}`,
      { active: true }
    );
    return response.data.data;
  },
};
