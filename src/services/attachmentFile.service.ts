import { apiClient } from '@/lib/api-client';
import { API_BASE_URL } from '@/lib/config';

/** One sheet of a spreadsheet preview: display strings, rows may be ragged. */
export type PreviewSheet = { name: string; rows: string[][]; truncated: boolean };

export type AttachmentPreview =
  | { kind: 'html'; html: string; truncated: boolean }
  | { kind: 'sheets'; sheets: PreviewSheet[]; truncated: boolean };

const asCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

/**
 * Read the preview envelope defensively: the FE can reach production before the backend that
 * serves it, and a field it does not send must degrade to "no preview", not a white screen.
 */
export const normalizeAttachmentPreview = (body: unknown): AttachmentPreview => {
  const data = (body as { data?: unknown } | null)?.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') throw new Error('Preview response has no data');
  const truncated = data.truncated === true;
  if (data.kind === 'html' && typeof data.html === 'string') {
    return { kind: 'html', html: data.html, truncated };
  }
  if (data.kind === 'sheets' && Array.isArray(data.sheets)) {
    const sheets = (data.sheets as unknown[]).map((sheet, index): PreviewSheet => {
      const raw = (sheet ?? {}) as { name?: unknown; rows?: unknown; truncated?: unknown };
      const rows = Array.isArray(raw.rows)
        ? (raw.rows as unknown[]).map((row) => (Array.isArray(row) ? row.map(asCell) : []))
        : [];
      return {
        name: typeof raw.name === 'string' && raw.name ? raw.name : `Sheet ${index + 1}`,
        rows,
        truncated: raw.truncated === true,
      };
    });
    return { kind: 'sheets', sheets, truncated };
  }
  throw new Error('Preview response has an unknown kind');
};

/**
 * The API path (after `/api/`) of a browser-loadable url the console built itself — the image
 * proxy url an inline image carries. Null for anything that is not ours.
 */
export const apiTailOf = (url: string, apiBaseUrl: string = API_BASE_URL): string | null => {
  if (!url.startsWith(apiBaseUrl)) return null;
  const rest = url.slice(apiBaseUrl.length);
  return rest.startsWith('/api/') && !rest.includes('..') ? rest.slice('/api/'.length) : null;
};

export const attachmentFileService = {
  /**
   * The bytes of an attachment, through apiClient (session, refresh, workspace header). A flag,
   * not a path, so every request path here is a literal the /api guard can read.
   */
  async getBlob(attachmentId: number, jiraHosted = false): Promise<Blob> {
    const response = jiraHosted
      ? await apiClient.get(`/api/attachments/jira/${attachmentId}/download`, {
          responseType: 'blob',
        })
      : await apiClient.get(`/api/attachments/${attachmentId}/download`, {
          responseType: 'blob',
        });
    return response.data as Blob;
  },

  /** A docx rendered to html, or an xlsx read into sheets, by the backend. */
  async getPreview(attachmentId: number): Promise<AttachmentPreview> {
    const response = await apiClient.get(`/api/attachments/${attachmentId}/preview`);
    return normalizeAttachmentPreview(response.data);
  },

  /** The bytes behind an inline image's proxy url — for Download. Null when the url is not ours. */
  async getInlineImageBlob(src: string): Promise<Blob | null> {
    const tail = apiTailOf(src);
    if (tail === null) return null;
    const response = await apiClient.get(`/api/${tail}`, { responseType: 'blob' });
    return response.data as Blob;
  },
};
