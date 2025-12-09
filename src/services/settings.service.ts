import type { AxiosResponse } from 'axios';
import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

// Types
export type Category = {
  id: number;
  name: string;
  description: string | null;
  keywords: string | null;
  departmentRole: 'support' | 'sales' | 'billing' | 'general' | 'hr';
  createdAt: string;
  updatedAt: string;
};

export type PromptTemplate = {
  id: number;
  type: 'system' | 'custom';
  name: string;
  description: string | null;
  prompt: string;
  active: boolean;
  departmentRole: 'support' | 'sales' | 'billing' | 'general' | 'hr';
  createdAt: string;
  updatedAt: string;
};

export type SpamRule = {
  id: number;
  name: string;
  description: string;
  pattern: string | null;
  category: string;
  severity: number;
  active: boolean;
  departmentRole: 'support' | 'sales' | 'billing' | 'general' | 'hr';
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDetectionRule = {
  id: number;
  organizationId: number;
  name: string;
  description: string;
  category: string;
  pattern: string | null;
  exampleText: string;
  confidence: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

// ==================== Categories ====================

const getCategories = async (): Promise<Category[]> => {
  const response: AxiosResponse<ApiResponse<Category[]>> = await apiClient.get(
    '/api/settings/categories'
  );
  return response.data.data as Category[];
};

const getCategoryById = async (id: number): Promise<Category> => {
  const response: AxiosResponse<ApiResponse<Category>> = await apiClient.get(
    `/api/settings/categories/${id}`
  );
  return response.data.data as Category;
};

const createCategory = async (data: {
  name: string;
  description?: string;
  keywords?: string;
}): Promise<Category> => {
  const response: AxiosResponse<ApiResponse<Category>> = await apiClient.post(
    '/api/settings/categories',
    data
  );
  return response.data.data as Category;
};

const updateCategory = async (
  id: number,
  data: {
    name?: string;
    description?: string;
    keywords?: string;
  }
): Promise<Category> => {
  const response: AxiosResponse<ApiResponse<Category>> = await apiClient.put(
    `/api/settings/categories/${id}`,
    data
  );
  return response.data.data as Category;
};

const deleteCategory = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/settings/categories/${id}`);
};

// ==================== Prompt Templates ====================

const getPromptTemplates = async (): Promise<PromptTemplate[]> => {
  const response: AxiosResponse<ApiResponse<PromptTemplate[]>> =
    await apiClient.get('/api/settings/prompts');
  return response.data.data as PromptTemplate[];
};

const getPromptTemplateById = async (id: number): Promise<PromptTemplate> => {
  const response: AxiosResponse<ApiResponse<PromptTemplate>> = await apiClient.get(
    `/api/settings/prompts/${id}`
  );
  return response.data.data as PromptTemplate;
};

const getPromptTemplateByName = async (name: string): Promise<PromptTemplate> => {
  const response: AxiosResponse<ApiResponse<PromptTemplate>> = await apiClient.get(
    `/api/settings/prompts/name/${name}`
  );
  return response.data.data as PromptTemplate;
};

const createPromptTemplate = async (data: {
  name: string;
  description?: string;
  prompt: string;
  active?: boolean;
}): Promise<PromptTemplate> => {
  const response: AxiosResponse<ApiResponse<PromptTemplate>> = await apiClient.post(
    '/api/settings/prompts',
    data
  );
  return response.data.data as PromptTemplate;
};

const updatePromptTemplate = async (
  id: number,
  data: {
    name?: string;
    description?: string;
    prompt?: string;
    active?: boolean;
  }
): Promise<PromptTemplate> => {
  const response: AxiosResponse<ApiResponse<PromptTemplate>> = await apiClient.put(
    `/api/settings/prompts/${id}`,
    data
  );
  return response.data.data as PromptTemplate;
};

const deletePromptTemplate = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/settings/prompts/${id}`);
};

// ==================== Spam Rules ====================

const getSpamRules = async (): Promise<SpamRule[]> => {
  const response: AxiosResponse<ApiResponse<SpamRule[]>> = await apiClient.get(
    '/api/settings/spam-rules'
  );
  return response.data.data as SpamRule[];
};

const getSpamRuleById = async (id: number): Promise<SpamRule> => {
  const response: AxiosResponse<ApiResponse<SpamRule>> = await apiClient.get(
    `/api/settings/spam-rules/${id}`
  );
  return response.data.data as SpamRule;
};

const createSpamRule = async (data: {
  name: string;
  description: string;
  pattern?: string;
  category: string;
  severity?: number;
  active?: boolean;
}): Promise<SpamRule> => {
  const response: AxiosResponse<ApiResponse<SpamRule>> = await apiClient.post(
    '/api/settings/spam-rules',
    data
  );
  return response.data.data as SpamRule;
};

const updateSpamRule = async (
  id: number,
  data: {
    name?: string;
    description?: string;
    pattern?: string;
    category?: string;
    severity?: number;
    active?: boolean;
  }
): Promise<SpamRule> => {
  const response: AxiosResponse<ApiResponse<SpamRule>> = await apiClient.put(
    `/api/settings/spam-rules/${id}`,
    data
  );
  return response.data.data as SpamRule;
};

const deleteSpamRule = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/settings/spam-rules/${id}`);
};

// ==================== Knowledge Detection Rules ====================

const getKnowledgeDetectionRules = async (): Promise<KnowledgeDetectionRule[]> => {
  const response: AxiosResponse<ApiResponse<KnowledgeDetectionRule[]>> = await apiClient.get(
    '/api/settings/knowledge-detection-rules'
  );
  return response.data.data as KnowledgeDetectionRule[];
};

const getKnowledgeDetectionRuleById = async (id: number): Promise<KnowledgeDetectionRule> => {
  const response: AxiosResponse<ApiResponse<KnowledgeDetectionRule>> = await apiClient.get(
    `/api/settings/knowledge-detection-rules/${id}`
  );
  return response.data.data as KnowledgeDetectionRule;
};

const createKnowledgeDetectionRule = async (data: {
  name: string;
  description: string;
  category: string;
  pattern?: string;
  exampleText: string;
  confidence?: number;
  active?: boolean;
}): Promise<KnowledgeDetectionRule> => {
  const response: AxiosResponse<ApiResponse<KnowledgeDetectionRule>> = await apiClient.post(
    '/api/settings/knowledge-detection-rules',
    data
  );
  return response.data.data as KnowledgeDetectionRule;
};

const updateKnowledgeDetectionRule = async (
  id: number,
  data: {
    name?: string;
    description?: string;
    category?: string;
    pattern?: string;
    exampleText?: string;
    confidence?: number;
    active?: boolean;
  }
): Promise<KnowledgeDetectionRule> => {
  const response: AxiosResponse<ApiResponse<KnowledgeDetectionRule>> = await apiClient.put(
    `/api/settings/knowledge-detection-rules/${id}`,
    data
  );
  return response.data.data as KnowledgeDetectionRule;
};

const deleteKnowledgeDetectionRule = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/settings/knowledge-detection-rules/${id}`);
};

// Export all services
export const settingsService = {
  // Categories
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  // Prompt Templates
  getPromptTemplates,
  getPromptTemplateById,
  getPromptTemplateByName,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  // Spam Rules
  getSpamRules,
  getSpamRuleById,
  createSpamRule,
  updateSpamRule,
  deleteSpamRule,
  // Knowledge Detection Rules
  getKnowledgeDetectionRules,
  getKnowledgeDetectionRuleById,
  createKnowledgeDetectionRule,
  updateKnowledgeDetectionRule,
  deleteKnowledgeDetectionRule,
};
