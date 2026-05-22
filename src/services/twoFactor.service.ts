import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export const twoFactorService = {
  async getStatus(): Promise<{ enabled: boolean }> {
    const res = await apiClient.get<ApiResponse<{ enabled: boolean }>>('/api/auth/2fa/status');
    return res.data.data ?? { enabled: false };
  },

  async setup(): Promise<{ secret: string; qrCodeDataUrl: string; otpAuthUrl: string }> {
    const res = await apiClient.get<
      ApiResponse<{ secret: string; qrCodeDataUrl: string; otpAuthUrl: string }>
    >('/api/auth/2fa/setup');
    return res.data.data!;
  },

  async enable(code: string): Promise<void> {
    await apiClient.post('/api/auth/2fa/enable', { code });
  },

  async disable(code: string): Promise<void> {
    await apiClient.post('/api/auth/2fa/disable', { code });
  },

  async authenticate(
    tempToken: string,
    code: string
  ): Promise<{ token: string; user: Record<string, unknown> }> {
    const res = await apiClient.post<
      ApiResponse<{ token: string; user: Record<string, unknown> }>
    >('/api/auth/2fa/authenticate', { tempToken, code });
    return res.data.data!;
  },

  async forcedSetup(tempToken: string): Promise<{ secret: string; qrCodeDataUrl: string; otpAuthUrl: string }> {
    const res = await apiClient.post<
      ApiResponse<{ secret: string; qrCodeDataUrl: string; otpAuthUrl: string }>
    >('/api/auth/2fa/forced-setup', { tempToken });
    return res.data.data!;
  },

  async forcedEnable(
    tempToken: string,
    code: string
  ): Promise<{ token: string; user: Record<string, unknown> }> {
    const res = await apiClient.post<
      ApiResponse<{ token: string; user: Record<string, unknown> }>
    >('/api/auth/2fa/forced-enable', { tempToken, code });
    return res.data.data!;
  },
};
