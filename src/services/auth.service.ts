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

  register: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    position?: string;
    invitationToken: string;
  }) => {
    const response = await apiClient.post<ApiResponse<{ email: string; firstName: string; lastName: string }>>(
      '/api/auth/register',
      data
    );
    return response.data;
  },

  verifyEmail: async (token: string) => {
    const response = await apiClient.get<ApiResponse<null>>(
      `/api/auth/verify-email?token=${token}`
    );
    return response.data;
  },

  resendVerification: async (email: string) => {
    const response = await apiClient.post<ApiResponse<null>>(
      '/api/auth/resend-verification',
      { email }
    );
    return response.data;
  },
};
