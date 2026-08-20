import { apiClient } from '@/lib/api-client';
import type { LoginRequest, LoginResponse, ApiResponse, User } from '@/types';

/** Public self-serve "create a workspace" signup (distinct from the invite-only register). */
export type SignupRequest = {
  workspaceName: string;
  firstName: string;
  email: string;
  password: string;
  lastName?: string;
  captchaToken?: string;
  /**
   * Plan preselected on the marketing site (`?plan=` on the landing CTA). The BE
   * filters it against its self-serve allowlist and stores it as wizard intent;
   * an unknown value is dropped, never rejected.
   */
  plan?: string;
};

export type SignupResponseData = {
  user: User;
  organization: { id: number; slug: string; name: string };
  onboarding: { status: string; currentStep: number; selectedPlan?: string };
};

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
  // (or a 2fa_pending temp token if the user has 2FA enabled). captchaToken
  // mirrors /auth/login — required when Turnstile is configured server-side
  // (production). The widget below the login form re-issues a fresh token
  // after the previous step consumes its one.
  selectOrganization: async (data: {
    tempToken: string;
    organizationId: number;
    captchaToken?: string;
  }) => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(
      '/api/auth/select-organization',
      data
    );
    return response.data;
  },

  /**
   * The workspaces this session may switch to — the caller's own active memberships,
   * the same set the multi-org login picker offers.
   */
  myOrganizations: async () => {
    const response = await apiClient.get<
      ApiResponse<{ organizations: { id: number; name: string; slug: string }[] }>
    >('/api/auth/my-organizations');
    return response.data.data?.organizations ?? [];
  },

  /**
   * Move this session to another of the user's workspaces.
   *
   * A member's JWT is bound to one organization, so the backend re-mints it and sets a
   * fresh cookie; this is not a client-side context flip. The caller should reload
   * afterwards so every cached query refetches under the new workspace.
   */
  switchOrganization: async (organizationId: number) => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(
      '/api/auth/switch-organization',
      { organizationId }
    );
    return response.data;
  },

  // Public, unauthenticated self-serve signup. On 201 the BE sets the httpOnly
  // `jwt` cookie (auto-login, exactly like a password login) and returns the new
  // user + organization + onboarding state (status 'pending', step 1).
  signup: async (data: SignupRequest) => {
    const response = await apiClient.post<ApiResponse<SignupResponseData>>(
      '/api/auth/signup',
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
