import { apiClient } from "@/lib/api-client";

// Types
export type Category = {
  id: number;
  name: string;
  description: string | null;
  keywords: string | null;
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
  createdAt: string;
  updatedAt: string;
};

// ==================== Categories ====================

const getCategories = async (): Promise<Category[]> => {
  const response = await apiClient.get('/api/settings/categories');
  return response.data.data;
};

const getCategoryById = async (id: number): Promise<Category> => {
  const response = await apiClient.get(`/api/settings/categories/${id}`);
  return response.data.data;
};

const createCategory = async (data: {
  name: string;
  description?: string;
  keywords?: string;
}): Promise<Category> => {
  const response = await apiClient.post('/api/settings/categories', data);
  return response.data.data;
};

const updateCategory = async (
  id: number,
  data: {
    name?: string;
    description?: string;
    keywords?: string;
  }
): Promise<Category> => {
  const response = await apiClient.put(`/api/settings/categories/${id}`, data);
  return response.data.data;
};

const deleteCategory = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/settings/categories/${id}`);
};

// ==================== Prompt Templates ====================

const getPromptTemplates = async (): Promise<PromptTemplate[]> => {
  const response = await apiClient.get('/api/settings/prompts');
  return response.data.data;
};

const getPromptTemplateById = async (id: number): Promise<PromptTemplate> => {
  const response = await apiClient.get(`/api/settings/prompts/${id}`);
  return response.data.data;
};

const getPromptTemplateByName = async (name: string): Promise<PromptTemplate> => {
  const response = await apiClient.get(`/api/settings/prompts/name/${name}`);
  return response.data.data;
};

const createPromptTemplate = async (data: {
  name: string;
  description?: string;
  prompt: string;
  active?: boolean;
}): Promise<PromptTemplate> => {
  const response = await apiClient.post('/api/settings/prompts', data);
  return response.data.data;
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
  const response = await apiClient.put(`/api/settings/prompts/${id}`, data);
  return response.data.data;
};

const deletePromptTemplate = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/settings/prompts/${id}`);
};

// ==================== Spam Rules ====================

const getSpamRules = async (): Promise<SpamRule[]> => {
  const response = await apiClient.get('/api/settings/spam-rules');
  return response.data.data;
};

const getSpamRuleById = async (id: number): Promise<SpamRule> => {
  const response = await apiClient.get(`/api/settings/spam-rules/${id}`);
  return response.data.data;
};

const createSpamRule = async (data: {
  name: string;
  description: string;
  pattern?: string;
  category: string;
  severity?: number;
  active?: boolean;
}): Promise<SpamRule> => {
  const response = await apiClient.post('/api/settings/spam-rules', data);
  return response.data.data;
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
  const response = await apiClient.put(`/api/settings/spam-rules/${id}`, data);
  return response.data.data;
};

const deleteSpamRule = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/settings/spam-rules/${id}`);
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
};
