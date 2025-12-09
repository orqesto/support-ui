import { apiClient } from '@/lib/api-client';
import type { LoginRequest, LoginResponse, ApiResponse } from '@/types';

export const authService = {
  verifyUser: async (data: { organizationSlug: string; email: string; captchaToken?: string }) => {
    const response = await apiClient.post<ApiResponse<{ exists: boolean; message?: string }>>(
      '/api/auth/verify-user',
      data
    );
    return response.data;
  },

  login: async (credentials: { captchaToken?: string } & LoginRequest) => {
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
    const response = await apiClient.post<
      ApiResponse<{ email: string; firstName: string; lastName: string }>
    >('/api/auth/register', data);
    return response.data;
  },

  verifyEmail: async (token: string) => {
    const response = await apiClient.get<ApiResponse<null>>(
      `/api/auth/verify-email?token=${token}`
    );
    return response.data;
  },

  resendVerification: async (email: string) => {
    const response = await apiClient.post<ApiResponse<null>>('/api/auth/resend-verification', {
      email,
    });
    return response.data;
  },

  forgotPassword: async (email: string, captchaToken?: string) => {
    const response = await apiClient.post<ApiResponse<null>>('/api/auth/forgot-password', {
      email,
      captchaToken,
    });
    return response.data;
  },

  resetPassword: async (token: string, password: string) => {
    const response = await apiClient.post<ApiResponse<null>>('/api/auth/reset-password', {
      token,
      password,
    });
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await apiClient.post<ApiResponse<null>>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  },
};
