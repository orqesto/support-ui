import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import type { ApiResponse } from '@/types';

/**
 * Reply templates (owner, 2026-10-09; plan `REPLY-TEMPLATES-PLAN-2026-10-09.md`, build spec
 * `REPLY-TEMPLATES-BUILD-SPEC-2026-10-09.md` A3): a workspace's or one department's saved replies,
 * inserted into a thread's reply box or turned into one draft per thread on a ticket.
 *
 * ⛔ Version skew: this frontend ships on merge, the backend on a tag. A backend without the
 * route answers 404 — reported as `unavailable`, and the page then offers no template menu.
 */

/** Which reply box lists the template: a thread's, a ticket's, or both. */
export type TemplateUse = 'thread' | 'ticket' | 'both';

export const TEMPLATE_USES: readonly TemplateUse[] = ['thread', 'ticket', 'both'];

export type ReplyTemplateAttachment = {
  id: number;
  /** The name the file was uploaded with. */
  filename: string;
  contentType: string;
  size: number;
};

export type ReplyTemplate = {
  id: number;
  name: string;
  /** HTML; placeholders such as `{first_name|there}` stay as tokens until a reply is sent. */
  body: string;
  use: TemplateUse;
  /** Null = the whole workspace. */
  departmentId: number | null;
  attachments: ReplyTemplateAttachment[];
  updatedAt: string;
  /** The caller may edit and archive it (the permission AND the template's department). */
  canEdit: boolean;
};

export type ReplyTemplates =
  | { unavailable: true }
  | { unavailable: false; templates: ReplyTemplate[] };

export type TemplateInput = {
  name: string;
  body: string;
  use: TemplateUse;
  departmentId: number | null;
};

const toAttachment = (raw: unknown): ReplyTemplateAttachment | null => {
  const row = (raw ?? {}) as Partial<ReplyTemplateAttachment>;
  if (typeof row.id !== 'number') return null;
  return {
    id: row.id,
    filename: typeof row.filename === 'string' && row.filename ? row.filename : `file-${row.id}`,
    contentType:
      typeof row.contentType === 'string' && row.contentType
        ? row.contentType
        : 'application/octet-stream',
    size: typeof row.size === 'number' ? row.size : 0,
  };
};

/** A row without an id, name or body is not a template this page can offer — it is dropped. */
export const toTemplate = (raw: unknown): ReplyTemplate | null => {
  const row = (raw ?? {}) as Partial<Record<keyof ReplyTemplate, unknown>>;
  if (typeof row.id !== 'number' || typeof row.name !== 'string' || typeof row.body !== 'string') {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    // A use this build does not know is listed where every template is: both boxes.
    use: TEMPLATE_USES.includes(row.use as TemplateUse) ? (row.use as TemplateUse) : 'both',
    departmentId: typeof row.departmentId === 'number' ? row.departmentId : null,
    attachments: (Array.isArray(row.attachments) ? row.attachments : [])
      .map(toAttachment)
      .filter((file): file is ReplyTemplateAttachment => file !== null),
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    // Fail closed: no edit controls unless the server says so.
    canEdit: row.canEdit === true,
  };
};

/** The body as JSON when there are no files, else multipart with every field as a string. */
const payloadOf = (fields: Record<string, unknown>, files: File[]) => {
  if (files.length === 0) return fields;
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  for (const file of files) form.append('attachments', file);
  return form;
};

/** The template in a create/update answer — `data` itself, or `data.template`. */
const templateOf = (data: unknown): ReplyTemplate => {
  const wrapped = (data ?? {}) as { template?: unknown };
  const template = toTemplate(wrapped.template ?? data);
  if (!template) throw new Error('The server did not return the template.');
  return template;
};

export const replyTemplatesService = {
  /** The live templates the caller can see — for one reply box (`use`), or all of them. */
  async list(use?: 'thread' | 'ticket'): Promise<ReplyTemplates> {
    try {
      const res = await apiClient.get<ApiResponse<{ templates?: unknown[] }>>(
        '/api/reply-templates',
        { params: use ? { use } : undefined }
      );
      const rows = res.data.data?.templates;
      return {
        unavailable: false,
        templates: (Array.isArray(rows) ? rows : [])
          .map(toTemplate)
          .filter((row): row is ReplyTemplate => row !== null),
      };
    } catch (error) {
      if (getErrorStatus(error) === 404) return { unavailable: true };
      throw error;
    }
  },

  async create(input: TemplateInput, files: File[] = []): Promise<ReplyTemplate> {
    const res = await apiClient.post<ApiResponse<unknown>>(
      '/api/reply-templates',
      payloadOf({ ...input }, files)
    );
    return templateOf(res.data.data);
  },

  async update(
    id: number,
    input: TemplateInput,
    removeAttachmentIds: number[] = [],
    files: File[] = []
  ): Promise<ReplyTemplate> {
    const res = await apiClient.put<ApiResponse<unknown>>(
      `/api/reply-templates/${id}`,
      payloadOf(
        { ...input, ...(removeAttachmentIds.length > 0 ? { removeAttachmentIds } : {}) },
        files
      )
    );
    return templateOf(res.data.data);
  },

  /** Archive: the template leaves every menu; replies already written from it are untouched. */
  async archive(id: number): Promise<void> {
    await apiClient.delete(`/api/reply-templates/${id}`);
  },

  /** One of a template's files, as a File the thread reply box can attach. */
  async downloadAttachment(templateId: number, attachment: ReplyTemplateAttachment): Promise<File> {
    const res = await apiClient.get(
      `/api/reply-templates/${templateId}/attachments/${attachment.id}`,
      { responseType: 'blob' }
    );
    return new File([res.data as Blob], attachment.filename, { type: attachment.contentType });
  },
};
