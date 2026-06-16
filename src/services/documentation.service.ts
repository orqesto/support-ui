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
};

export type DocumentationStats = {
  totalDocs: number;
  totalChunks: number;
  readyDocs: number;
  processingDocs: number;
  failedDocs: number;
  totalReferences: number;
};

export type SearchResult = {
  id: number;
  documentationId: number;
  organizationId: number;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[];
  timesReferenced: number;
  lastReferencedAt: string | null;
  createdAt: string;
  metadata: unknown;
  similarity: number;
  documentTitle: string;
};

export type DocumentationProgress = {
  stage: 'extracting' | 'chunking' | 'embedding' | 'saving' | 'complete' | 'unknown';
  percentage: number;
  current?: number;
  total?: number;
  message?: string;
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
  formData.append('file', file);
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
  return response.data;
};

const getDocumentation = async (id: number): Promise<Documentation> => {
  const response = await apiClient.get<Documentation>(`/api/documentation/${id}`);
  return response.data;
};

const deleteDocumentation = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/documentation/${id}`);
};

const toggleEnabled = async (id: number, enabled: boolean): Promise<Documentation> => {
  const response = await apiClient.patch<Documentation>(`/api/documentation/${id}/enabled`, { enabled });
  return response.data;
};

const setDepartments = async (id: number, departmentIds: number[]): Promise<void> => {
  await apiClient.put(`/api/documentation/${id}/departments`, { departmentIds });
};

const searchDocumentation = async (query: string, limit?: number): Promise<SearchResult[]> => {
  const response = await apiClient.post<SearchResult[]>('/api/documentation/search', {
    query,
    limit,
  });
  return response.data;
};

const getStats = async (): Promise<DocumentationStats> => {
  const response = await apiClient.get<DocumentationStats>('/api/documentation/stats');
  return response.data;
};

const getDocumentationContent = async (id: number): Promise<{ content: string; chunkIndex: number }[]> => {
  const response = await apiClient.get<{ content: string; chunkIndex: number }[]>(
    `/api/documentation/${id}/content`
  );
  return response.data;
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
  getProgress,
  deleteDocumentation,
  toggleEnabled,
  setDepartments,
  searchDocumentation,
  getStats,
};
