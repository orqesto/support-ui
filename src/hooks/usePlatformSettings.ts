import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  platformSettingsService,
  type DefaultStorageInput,
  type ManagedAiInput,
  type PlatformDatabaseInput,
  type PlatformSecretKey,
} from '@/services/platformSettings.service';

const KEY = ['platform', 'settings'] as const;
const MODELS_KEY = ['platform', 'settings', 'ai-models'] as const;

export const usePlatformSettings = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => platformSettingsService.get(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

/**
 * The per-provider model catalog for the tier pickers. Static server-side, so it
 * is cached hard — switching provider re-reads from cache, never re-fetches.
 */
export const usePlatformAiModels = () =>
  useQuery({
    queryKey: MODELS_KEY,
    queryFn: () => platformSettingsService.models(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

/**
 * Mutations all invalidate the settings query so the source badges + statuses refresh.
 *
 * ⛔ A SAVE MUST REPORT ITS OWN REFUSAL. Until 2026-09-11 none of these carried `onError`,
 * their cards passed `{ onSuccess }` only, and `main.tsx` installs no MutationCache handler —
 * so a rejected save was swallowed whole. Verified on staging: an invalid Bedrock role ARN
 * flipped the button to "Loading…" and back and rendered nothing anywhere on the page.
 *
 * Two mutations here deliberately stay silent, because their CALLER already shows the
 * failure where it belongs: `setSecret` (SecretField renders the refusal beside the input,
 * so the value can be retyped) and `testStorage` (the card renders a probe result). A toast
 * on top of either would report one refusal twice — the tests pin both.
 */
export const useUpdatePlatformAi = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManagedAiInput) => platformSettingsService.updateAi(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (error: unknown) => toast.failure('save the Managed AI defaults', error),
  });
};

export const useUpdatePlatformStorage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DefaultStorageInput) => platformSettingsService.updateStorage(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (error: unknown) => toast.failure('save the storage defaults', error),
  });
};

export const useUpdatePlatformDatabase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlatformDatabaseInput) => platformSettingsService.updateDatabase(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useSetPlatformSecret = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      value,
      force,
    }: {
      key: PlatformSecretKey;
      value: string;
      /** Store a credential the provider refused — see `setSecret`. */
      force?: boolean;
    }) => platformSettingsService.setSecret(key, value, { force }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useClearPlatformSecret = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: PlatformSecretKey) => platformSettingsService.clearSecret(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (error: unknown) => toast.failure('clear that credential', error),
  });
};

export const useTestPlatformStorage = () =>
  useMutation({
    mutationFn: (input: DefaultStorageInput) => platformSettingsService.testStorage(input),
  });
