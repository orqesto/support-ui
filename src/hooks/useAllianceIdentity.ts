import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  allianceSsoService,
  type AllianceSsoConfig,
  type AllianceSsoConfigInput,
} from '@/services/alliance-sso.service';

/**
 * React-query hooks for the alliance Identity section (05-06). Keys are namespaced
 * by allianceId — the OIDC config under ['alliance', id, 'sso'] and the
 * domain-verification list under ['alliance', id, 'domains'] — so switching
 * alliances invalidates cleanly. PUT invalidates 'sso'; add/verify/remove invalidate
 * 'domains'. Mutations surface sonner toasts on success/error.
 */

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/** Run the SSO connection preflight (POST .../sso/test). Read-only; no cache to invalidate. */
export const useTestAllianceSso = (allianceId: number | null) =>
  useMutation({
    mutationFn: () => allianceSsoService.testSso(allianceId as number),
    onError: (error: unknown) =>
      toast.error(errorMessage(error, 'Could not test the SSO connection')),
  });

// ─── OIDC connection ───────────────────────────────────────────────────────────
export const useAllianceSso = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'sso'],
    queryFn: () => allianceSsoService.getSsoConfig(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

export const useSaveAllianceSso = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AllianceSsoConfigInput): Promise<AllianceSsoConfig> =>
      allianceSsoService.putSsoConfig(allianceId as number, input),
    onSuccess: (config) => {
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'sso'] });
      // Overview shows SSO connection status — refresh it too.
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'overview'] });
      toast.success(config.enabled ? 'SSO configuration saved and enabled' : 'SSO configuration saved');
    },
    onError: (error: unknown) =>
      toast.error(errorMessage(error, 'Could not save SSO configuration')),
  });
};

// ─── Domain verification ─────────────────────────────────────────────────────
export const useAllianceDomains = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'domains'],
    queryFn: () => allianceSsoService.listDomains(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

const useDomainsInvalidator = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'domains'] });
};

export const useAddDomain = (allianceId: number | null) => {
  const invalidate = useDomainsInvalidator(allianceId);
  return useMutation({
    mutationFn: (domain: string) => allianceSsoService.addDomain(allianceId as number, domain),
    onSuccess: (row) => {
      void invalidate();
      toast.success(`Added ${row.domain}`);
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not add domain')),
  });
};

export const useVerifyDomain = (allianceId: number | null) => {
  const invalidate = useDomainsInvalidator(allianceId);
  return useMutation({
    mutationFn: (domainId: number) => allianceSsoService.verifyDomain(allianceId as number, domainId),
    onSuccess: (result) => {
      void invalidate();
      if (result.verified) {
        toast.success('Domain verified');
      } else {
        toast.error('TXT record not found yet — DNS can take a few minutes to propagate');
      }
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not verify domain')),
  });
};

export const useRemoveDomain = (allianceId: number | null) => {
  const invalidate = useDomainsInvalidator(allianceId);
  return useMutation({
    mutationFn: (domainId: number) => allianceSsoService.removeDomain(allianceId as number, domainId),
    onSuccess: () => {
      void invalidate();
      toast.success('Domain removed');
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not remove domain')),
  });
};
