import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

type BackendVersion = {
  version: string;
  gitSha: string;
  buildTime: string;
  selfHosted: boolean;
  // Authoritative billing signal from the BE: true only when a billing provider
  // is configured (managed SaaS). When false the FE hides ALL billing/upgrade/
  // paywall UI — decoupled from selfHosted, so a not-yet-activated managed box
  // hides billing too. Defaults to false so a box with no signal stays hidden.
  billingEnabled: boolean;
  // Self-hosted opt-in (BEDROCK_ALLOW_INSTANCE_PROFILE): gates the Bedrock
  // "EC2 instance profile" credential option in the provider UI.
  bedrockInstanceProfile: boolean;
  // A LICENSED single-tenant box (BE DEPLOYMENT_MODE=self_hosted). Hides the plan
  // CATALOG (Plans & Pricing): the instance was bought outright, so there is nothing
  // to sell, and the BE puts new workspaces straight on the unlimited `admin` plan.
  //
  // Distinct from `selfHosted` above, which derives from "billing enforcement off" and
  // is ALSO true on a managed box before billing is switched on — gating the catalog on
  // that one would hide Plans & Pricing on managed prod.
  //
  // Defaults to FALSE, which matters during a deploy: this field does not exist on a BE
  // that has not shipped yet, and the safe reading of "unknown" is "show the catalog".
  selfHostedDeployment: boolean;
};

/**
 * Public BE version + git SHA + build time, surfaced in the sidebar footer
 * next to the FE version so FE/BE drift is visible at a glance. Public
 * endpoint, no auth — safe to call before login.
 *
 * Also exposes `selfHosted` so Layout can hide customer-facing billing UI
 * (Subscription, Pricing, Billing Intelligence) on self-hosted deployments.
 * Defaults to false on missing field so existing SaaS clients are unaffected.
 */
export const useBackendVersion = () =>
  useQuery<BackendVersion>({
    queryKey: ['backend-version'],
    queryFn: async () => {
      const res = await apiClient.get<{
        success: boolean;
        version: string;
        gitSha?: string;
        buildTime?: string;
        deployment?: {
          selfHosted?: boolean;
          billingEnabled?: boolean;
          bedrockInstanceProfile?: boolean;
          selfHostedDeployment?: boolean;
        };
      }>('/api/health/version');
      return {
        version: res.data.version ?? 'unknown',
        gitSha: res.data.gitSha ?? 'dev',
        buildTime: res.data.buildTime ?? 'unknown',
        selfHosted: res.data.deployment?.selfHosted ?? false,
        billingEnabled: res.data.deployment?.billingEnabled ?? false,
        bedrockInstanceProfile: res.data.deployment?.bedrockInstanceProfile ?? false,
        selfHostedDeployment: res.data.deployment?.selfHostedDeployment ?? false,
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
