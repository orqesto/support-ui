import { apiClient } from '@/lib/api-client';
import type { LoginRequest, LoginResponse, ApiResponse } from '@/types';

export const authService = {
  login: async (credentials: LoginRequest) => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(
      '/api/auth/login',
      credentials
    );
    return response.data;
  },

  register: async (data: { email: string; password: string; name: string }) => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(
      '/api/auth/register',
      data
    );
    return response.data;
  },
};
