import { apiClient } from '@/lib/api-client';

export type DocumentType = 'technical' | 'nda' | 'legal' | 'policy' | 'template' | 'general';

export type Documentation = {
  id: number;
  organizationId: number;
  departmentRole: 'support' | 'sales' | 'billing' | 'general' | 'hr';
  visibility: 'department' | 'organization';
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
  visibility?: 'department' | 'organization',
  documentType?: DocumentType,
  onUploadProgress?: (progressEvent: { loaded: number; total?: number; progress?: number }) => void
): Promise<Documentation> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  if (description) {
    formData.append('description', description);
  }
  if (visibility) {
    formData.append('visibility', visibility);
  }
  if (documentType) {
    formData.append('documentType', documentType);
  }

  const response = await apiClient.post<Documentation>('/api/documentation', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
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
  searchDocumentation,
  getStats,
};
