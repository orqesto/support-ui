import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  platformSettingsService,
  type DefaultStorageInput,
  type ManagedAiInput,
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

/** Mutations all invalidate the settings query so the source badges + statuses refresh. */
export const useUpdatePlatformAi = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManagedAiInput) => platformSettingsService.updateAi(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useUpdatePlatformStorage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DefaultStorageInput) => platformSettingsService.updateStorage(input),
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
  });
};

export const useTestPlatformStorage = () =>
  useMutation({
    mutationFn: (input: DefaultStorageInput) => platformSettingsService.testStorage(input),
  });
