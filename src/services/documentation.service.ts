import { apiClient } from '../lib/api-client';

export type Documentation = {
  id: number;
  organizationId: number;
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

const uploadDocumentation = async (file: File, title: string, description?: string): Promise<Documentation> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  if (description) {
    formData.append('description', description);
  }

  const response = await apiClient.post<Documentation>('/api/documentation', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
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

export const documentationService = {
  uploadDocumentation,
  listDocumentation,
  getDocumentation,
  deleteDocumentation,
  searchDocumentation,
  getStats,
};
