import { apiClient } from '@/lib/api-client';

export type ActiveModule = {
  id: number;
  moduleId: number;
  isActive: boolean;
  activatedAt: string;
  name: string;
  displayName: string;
};

const getActiveModules = () =>
  apiClient
    .get<{ success: boolean; data: { modules: ActiveModule[] } }>('/api/subscriptions/modules/active')
    .then((r) => r.data.data.modules);

export const subscriptionService = {
  getActiveModules,
};
