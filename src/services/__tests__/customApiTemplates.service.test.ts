import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, post, patch } }));

const { customApiTemplateService, customApiTemplateAdminService } = await import(
  '../customApiTemplates.service'
);

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { success: true, data: [{ id: 1 }] } });
  post.mockReset().mockResolvedValue({ data: { success: true, data: { id: 2 } } });
  patch.mockReset().mockResolvedValue({ data: { success: true, data: { id: 3 } } });
});

describe('custom API template services', () => {
  it('workspace reads published templates from /api/custom-apis/templates', async () => {
    expect(await customApiTemplateService.listPublished()).toEqual([{ id: 1 }]);
    expect(get).toHaveBeenCalledWith('/api/custom-apis/templates');
  });

  it('console lists, creates and patches under /api/admin/platform/custom-api-templates', async () => {
    await customApiTemplateAdminService.list();
    expect(get).toHaveBeenCalledWith('/api/admin/platform/custom-api-templates');
    expect(
      await customApiTemplateAdminService.create({ key: 'k', name: 'N', definition: {} as never })
    ).toEqual({ id: 2 });
    expect(post).toHaveBeenCalledWith('/api/admin/platform/custom-api-templates', {
      key: 'k',
      name: 'N',
      definition: {},
    });
    expect(await customApiTemplateAdminService.update(3, { status: 'published' })).toEqual({
      id: 3,
    });
    expect(patch).toHaveBeenCalledWith('/api/admin/platform/custom-api-templates/3', {
      status: 'published',
    });
  });

  it('a missing data array reads as empty, never undefined', async () => {
    get.mockResolvedValue({ data: { success: true } });
    expect(await customApiTemplateService.listPublished()).toEqual([]);
  });
});
