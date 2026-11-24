import { apiClient } from '@/lib/api-client';

export type DocumentType = 'technical' | 'nda' | 'legal' | 'policy' | 'template' | 'general';

// Dept scoping is junction-driven:
//   departmentIds: []        → org-wide (every dept can see/search this doc)
//   departmentIds: [a, b, …] → scoped to those depts only
export type Documentation = {
  id: number;
  organizationId: number;
  departmentIds: number[];
  documentType: DocumentType;
  chunkingStrategy: string | null;
  allowQuoting: boolean;
  title: string;
  description: string | null;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  url: string;
  status: 'processing' | 'ready' | 'failed';
  processingError: string | null;
  enabled: boolean;
  chunkCount: number;
  embeddingProvider: string | null;
  embeddingModel: string | null;
  timesReferenced: number;
  lastReferencedAt: string | null;
  uploadedBy: number;
  createdAt: string;
  updatedAt: string;
  metadata: unknown;
  // External-source provenance (e.g. Confluence sync). null = uploaded manually.
  externalSource?: string | null;
  externalId?: string | null;
  // Link back to the source page (Confluence sync writes it; null on uploads). Absent on an
  // older backend.
  externalUrl?: string | null;
  sourceDeleted?: boolean;
  // A synced page's place in its source, titles top down ([space, …parents, page]). null on
  // uploads and on a backend that does not send it (normalised by `sourcePathOf`).
  sourcePath?: string[] | null;
};

/** `sourcePath` as the backend sent it, or null when absent or not a list of titles. */
export const sourcePathOf = (raw: unknown): string[] | null => {
  if (!Array.isArray(raw)) return null;
  const parts = raw.filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  return parts.length > 0 ? parts : null;
};

/** What the text preview shows of a synced page beyond its chunks. */
export type DocumentationFormatted = {
  /** The page as Markdown (formatting kept); null when the backend has none or predates it. */
  contentMarkdown: string | null;
  sourcePath: string[] | null;
};

export const normalizeDocumentationFormatted = (raw: unknown): DocumentationFormatted => {
  const row = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const markdown = row.contentMarkdown;
  return {
    contentMarkdown: typeof markdown === 'string' && markdown.trim() !== '' ? markdown : null,
    sourcePath: sourcePathOf(row.sourcePath),
  };
};

export type DocumentationStats = {
  totalDocs: number;
  totalChunks: number;
  readyDocs: number;
  processingDocs: number;
  failedDocs: number;
  totalReferences: number;
};

export type DocumentationProgress = {
  stage: 'extracting' | 'chunking' | 'embedding' | 'saving' | 'complete' | 'unknown';
  percentage: number;
  current?: number;
  total?: number;
  message?: string;
};

/**
 * The types the upload endpoint accepts. The backend checks the multipart part's
 * Content-Type, which the browser takes from `File.type` — and for a Markdown file that is
 * often empty, `application/octet-stream` or `text/x-markdown` (it comes from the OS, not
 * the file). Anything outside this list was refused by the server's type filter with a
 * 500, so a `.md` the picker offered never reached the knowledge base.
 */
const ACCEPTED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** The type to send for each extension the picker offers, when the browser gave another. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * The file as the server expects it: same bytes and name, with the type its extension names
 * when the browser's own type is not one the server accepts. Images and accepted types pass
 * through untouched.
 */
export const withUploadType = (file: File): File => {
  if (ACCEPTED_UPLOAD_TYPES.has(file.type) || file.type.startsWith('image/')) return file;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = TYPE_BY_EXTENSION[extension];
  if (!type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
};

const uploadDocumentation = async (
  file: File,
  title: string,
  description?: string,
  // [] = org-wide (visible everywhere). [a, b, …] = scoped to those depts.
  departmentIds: number[] = [],
  documentType?: DocumentType,
  onUploadProgress?: (progressEvent: { loaded: number; total?: number; progress?: number }) => void
): Promise<Documentation> => {
  const formData = new FormData();
  formData.append('file', withUploadType(file));
  formData.append('title', title);
  if (description) {
    formData.append('description', description);
  }
  // departmentIds is JSON-encoded because multipart doesn't preserve array shape.
  // BE decodes before Zod validation.
  formData.append('departmentIds', JSON.stringify(departmentIds));
  if (documentType) {
    formData.append('documentType', documentType);
  }

  const response = await apiClient.post<Documentation>('/api/documentation', formData, {
    onUploadProgress: (progressEvent) => {
      if (onUploadProgress) {
        const progress = progressEvent.total
          ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
          : 0;
        onUploadProgress({
          loaded: progressEvent.loaded,
          total: progressEvent.total,
          progress,
        });
      }
    },
  });
  return response.data;
};

const listDocumentation = async (): Promise<Documentation[]> => {
  const response = await apiClient.get<Documentation[]>('/api/documentation');
  return Array.isArray(response.data)
    ? response.data.map((row) => ({ ...row, sourcePath: sourcePathOf(row.sourcePath) }))
    : response.data;
};

const getDocumentation = async (id: number): Promise<Documentation> => {
  const response = await apiClient.get<Documentation>(`/api/documentation/${id}`);
  return response.data;
};

/** One document's formatted page and path (`GET /api/documentation/:id`). */
const getDocumentationFormatted = async (id: number): Promise<DocumentationFormatted> => {
  const response = await apiClient.get<unknown>(`/api/documentation/${id}`);
  return normalizeDocumentationFormatted(response.data);
};

const deleteDocumentation = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/documentation/${id}`);
};

// The toggle endpoint returns the raw documentation row. `departmentIds` is assembled
// from the junction table by the LIST endpoint, so older backends omit it here — hence
// the partial type. Callers must merge this over the row they already hold rather than
// replacing it; replacing dropped the dept scope and crashed the Knowledge Base page.
export type ToggledDocumentation = Omit<Documentation, 'departmentIds'> &
  Partial<Pick<Documentation, 'departmentIds'>>;

const toggleEnabled = async (id: number, enabled: boolean): Promise<ToggledDocumentation> => {
  const response = await apiClient.patch<ToggledDocumentation>(
    `/api/documentation/${id}/enabled`,
    { enabled }
  );
  return response.data;
};

const setDepartments = async (id: number, departmentIds: number[]): Promise<void> => {
  await apiClient.put(`/api/documentation/${id}/departments`, { departmentIds });
};

const getStats = async (): Promise<DocumentationStats> => {
  const response = await apiClient.get<DocumentationStats>('/api/documentation/stats');
  return response.data;
};

export type DocumentationChunkContent = { content: string; chunkIndex: number };

/**
 * The stored chunks, in chunk order. Normalised: a non-array answer is no chunks, a row without
 * text is skipped, and the order is the chunk index whatever order the rows came in.
 */
export const normalizeDocumentationChunks = (raw: unknown): DocumentationChunkContent[] =>
  (Array.isArray(raw) ? raw : [])
    .filter(
      (row): row is { content: string; chunkIndex?: unknown } =>
        typeof row === 'object' && row !== null && typeof (row as { content?: unknown }).content === 'string'
    )
    .map((row, position) => ({
      content: row.content,
      chunkIndex: typeof row.chunkIndex === 'number' ? row.chunkIndex : position,
    }))
    .sort((left, right) => left.chunkIndex - right.chunkIndex);

const getDocumentationContent = async (id: number): Promise<DocumentationChunkContent[]> => {
  const response = await apiClient.get<unknown>(`/api/documentation/${id}/content`);
  return normalizeDocumentationChunks(response.data);
};

const getProgress = async (id: number): Promise<DocumentationProgress> => {
  const response = await apiClient.get<DocumentationProgress>(`/api/documentation/${id}/progress`);
  return response.data;
};

export const documentationService = {
  uploadDocumentation,
  listDocumentation,
  getDocumentation,
  getDocumentationContent,
  getDocumentationFormatted,
  getProgress,
  deleteDocumentation,
  toggleEnabled,
  setDepartments,
  getStats,
};
