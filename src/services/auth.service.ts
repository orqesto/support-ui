import { apiClient } from '@/lib/api-client';
import type { LoginRequest, LoginResponse, ApiResponse } from '@/types';

export const authService = {
  // Step 1 of the multi-step login: captcha-gated, no disclosure of user/org.
  checkEmail: async (data: { email: string; captchaToken?: string }) => {
    const response = await apiClient.post<ApiResponse<null>>('/api/auth/check-email', data);
    return response.data;
  },

  // Step 2: submit credentials. Server returns one of:
  //  - { requiresOrgSelection, tempToken, organizations } (user has >1 org)
  //  - { twoFactorRequired, tempToken } (single org or post-pick, 2FA path)
  //  - { user } (single-org, no 2FA — login complete)
  login: async (credentials: { captchaToken?: string } & LoginRequest) => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(
      '/api/auth/login',
      credentials
    );
    return response.data;
  },

  // Step 3: exchange the org_pending temp token + chosen org for a full JWT
  // (or a 2fa_pending temp token if the user has 2FA enabled).
  selectOrganization: async (data: { tempToken: string; organizationId: number }) => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(
      '/api/auth/select-organization',
      data
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
    const response = await apiClient.post<ApiResponse<null>>('/api/auth/verify-email', { token });
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
